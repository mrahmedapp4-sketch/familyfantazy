import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, getDocs, where, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match, Prediction, User } from '../types';
import { isAdmin } from '../lib/admin';

export default function AdminPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  
  // Default to today/now
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [kickoffTime, setKickoffTime] = useState('');
  const [cutoffTime, setCutoffTime] = useState('');
  const [hasEgypt, setHasEgypt] = useState(false);

  const [bracketNodes, setBracketNodes] = useState<Record<string, string>>({});
  const [savingBracket, setSavingBracket] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{text: string, type: 'error'|'success'} | null>(null);

  const [apiKeys, setApiKeys] = useState<{ id: string, key: string, name: string, createdAt: number }[]>([]);
  const [newKeyName, setNewKeyName] = useState('');

  const showMsg = (text: string, type: 'error'|'success' = 'success') => {
    setStatusMsg({text, type});
    setTimeout(() => setStatusMsg(null), 5000);
  };

  useEffect(() => {
    // Set default dates to today
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const dateStr = now.toISOString().slice(0, 16);
    setKickoffTime(dateStr);
    
    now.setHours(now.getHours() + 2);
    setCutoffTime(now.toISOString().slice(0, 16));
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    // API keys list
    const qKeys = query(collection(db, 'api_keys'), orderBy('createdAt', 'desc'));
    const unsubKeys = onSnapshot(qKeys, (snapshot) => {
      setApiKeys(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
    return unsubKeys;
  }, []);

  useEffect(() => {
    const unsubBracket = onSnapshot(doc(db, 'bracket', 'main'), (d) => {
      if (d.exists()) {
        setBracketNodes(d.data().nodes || {});
      }
    });
    return unsubBracket;
  }, []);

  const addMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeTeam || !awayTeam || !kickoffTime || !cutoffTime) return;

    try {
      await addDoc(collection(db, 'matches'), {
        homeTeam,
        awayTeam,
        kickoffTime: new Date(kickoffTime).getTime(),
        cutoffTime: new Date(cutoffTime).getTime(),
        hasEgypt,
        homeScore: null,
        awayScore: null,
        status: 'pending',
        createdAt: Date.now()
      });
      showMsg('تم اضافة المباراة بنجاح');
      setHomeTeam(''); setAwayTeam(''); setHasEgypt(false);
    } catch (err: any) {
      showMsg("خطأ: " + err.message, 'error');
    }
  };

  const completeMatch = async (match: Match, homeScore: number, awayScore: number) => {
    try {
      await updateDoc(doc(db, 'matches', match.id), {
        status: 'completed',
        homeScore,
        awayScore
      });

      const predsQuery = query(collection(db, 'predictions'), where('matchId', '==', match.id));
      const predsSnap = await getDocs(predsQuery);

      for (const p of predsSnap.docs) {
        const pred = p.data() as Prediction;
        let points = 0;

        const exactMatch = pred.homeScore === homeScore && pred.awayScore === awayScore;
        const homeCorrect = pred.homeScore === homeScore;
        const awayCorrect = pred.awayScore === awayScore;

        if (exactMatch) {
          points = match.hasEgypt ? 5 : 3;
        } else if (homeCorrect || awayCorrect) {
          points = 1;
        }

        await updateDoc(doc(db, 'predictions', p.id), {
          points,
          status: 'scored',
          updatedAt: Date.now()
        });

        if (points > 0) {
          const userRef = doc(db, 'users', pred.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data() as User;
            await updateDoc(userRef, {
              totalPoints: (userData.totalPoints || 0) + points
            });
          }
        }
      }
      
      showMsg('تم اعتماد النتيجة وتسجيل النقاط بنجاح!');
    } catch(err: any) {
      showMsg("خطأ: " + err.message, 'error');
    }
  };

  const saveBracket = async () => {
    setSavingBracket(true);
    try {
      await setDoc(doc(db, 'bracket', 'main'), { nodes: bracketNodes }, { merge: true });
      showMsg('تم حفظ الخريطة!');
    } catch(err: any) {
      showMsg("خطأ: " + err.message, 'error');
    }
    setSavingBracket(false);
  };

  const updateNode = (key: string, value: string) => {
    setBracketNodes(prev => ({ ...prev, [key]: value }));
  };

  const generateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName) return;
    try {
      // Generate a random key
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let key = 'FF_';
      for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      await addDoc(collection(db, 'api_keys'), {
        name: newKeyName,
        key: key,
        createdAt: Date.now()
      });
      setNewKeyName('');
      showMsg('تم إنشاء مفتاح API بنجاح.');
    } catch(err: any) {
      showMsg("خطأ: " + err.message, 'error');
    }
  };

  const clearDatabase = async () => {
    const code = window.prompt("هل أنت متأكد من مسح البيانات السابقة وحذف حسابات اللاعبين؟ اكتب 'تأكيد' للتأكيد.");
    if (code !== 'تأكيد') {
      showMsg("تم إلغاء مسح البيانات.", 'error');
      return;
    }
    try {
      showMsg("جاري تنظيف وحذف البيانات...", 'success');
      
      const matchesQuery = query(collection(db, 'matches'), where('status', '==', 'completed'));
      const matchesSnap = await getDocs(matchesQuery);
      
      // Delete completed matches
      for (const d of matchesSnap.docs) {
        await deleteDoc(d.ref);
      }
      
      // Delete all predictions (since accounts are being cleared)
      const predsSnap = await getDocs(collection(db, 'predictions'));
      for (const d of predsSnap.docs) {
        await deleteDoc(d.ref);
      }
      
      // Delete all non-admin user documents from Firestore
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const d of usersSnap.docs) {
        const u = d.data();
        const userEmail = (u.email || '').toLowerCase().trim();
        const dName = u.displayName || '';
        if (!isAdmin(userEmail, dName)) {
          await deleteDoc(d.ref);
        }
      }
      
      showMsg("تم تنظيف المباريات السابقة وحذف جميع حسابات اللاعبين وتوقعاتهم بنجاح!");
    } catch(err: any) {
      showMsg("خطأ أثناء التنظيف: " + err.message, 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col space-y-8 pb-12 w-full relative">
      {statusMsg && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-bold text-sm shadow-lg z-50 transition-all ${statusMsg.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {statusMsg.text}
        </div>
      )}

      <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-100 shadow-sm">
        <h1 className="text-2xl font-black mb-8 text-slate-800 tracking-tight border-b border-slate-100 pb-4">لوحة التحكم</h1>
        
        <div className="mb-8">
          <h2 className="text-sm font-bold text-slate-500 mb-6">إضافة مباراة جديدة</h2>
          <form onSubmit={addMatch} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl">
            <input type="text" placeholder="الفريق المضيف" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} className="px-4 py-3 border border-slate-200 rounded-xl focus:border-slate-400 focus:bg-white outline-none font-bold text-sm" required />
            <input type="text" placeholder="الفريق الضيف" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} className="px-4 py-3 border border-slate-200 rounded-xl focus:border-slate-400 focus:bg-white outline-none font-bold text-sm" required />
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-2">موعد بداية المباراة</label>
              <input type="datetime-local" value={kickoffTime} onChange={e => setKickoffTime(e.target.value)} className="px-4 py-3 border border-slate-200 rounded-xl w-full focus:border-slate-400 focus:bg-white outline-none font-mono text-sm" required />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-2">موعد إغلاق التوقع</label>
              <input type="datetime-local" value={cutoffTime} onChange={e => setCutoffTime(e.target.value)} className="px-4 py-3 border border-slate-200 rounded-xl w-full focus:border-slate-400 focus:bg-white outline-none font-mono text-sm" required />
            </div>
            <div className="flex items-center space-x-3 space-x-reverse p-4 border border-amber-200 bg-amber-50 rounded-xl">
              <input type="checkbox" id="egypt" checked={hasEgypt} onChange={e => setHasEgypt(e.target.checked)} className="w-5 h-5 accent-slate-900" />
              <label htmlFor="egypt" className="text-xs font-black text-amber-700">تفعيل مكافأة الـ 5 نقاط (مباراة مصر)</label>
            </div>
            <button type="submit" className="bg-slate-900 text-white text-sm font-black py-4 rounded-xl hover:bg-slate-800 transition-colors mt-auto shadow-md">إضافة المباراة</button>
          </form>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-100 shadow-sm">
        <h2 className="text-sm font-bold text-slate-500 mb-6">تحديث الخريطة</h2>
        
        <div className="space-y-4 bg-slate-50 p-6 rounded-2xl">
          <p className="text-xs text-slate-500 mb-4 font-bold">يرجى كتابة أسماء الفرق كما تريدها أن تظهر في الخريطة.</p>
          <div className="flex flex-col gap-4 max-w-sm">
             <div className="space-y-2 flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase">النهائي</span>
                <input type="text" value={bracketNodes['Final'] || ''} onChange={e => updateNode('Final', e.target.value)} placeholder="بطل العالم" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-center" />
             </div>
          </div>
          <hr className="border-slate-200 my-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2 flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase">نصف نهائي 1</span>
              <input type="text" value={bracketNodes['SF1'] || ''} onChange={e => updateNode('SF1', e.target.value)} placeholder="نصف نهائي 1" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-center" />
            </div>
            <div className="space-y-2 flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase">نصف نهائي 2</span>
              <input type="text" value={bracketNodes['SF2'] || ''} onChange={e => updateNode('SF2', e.target.value)} placeholder="نصف نهائي 2" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-center" />
            </div>
          </div>
          
          <button onClick={saveBracket} disabled={savingBracket} className="mt-4 bg-emerald-600 text-white font-black py-3 px-6 rounded-xl hover:bg-emerald-700 transition shadow-md text-sm">
            حفظ الخريطة
          </button>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-100 shadow-sm">
        <h2 className="text-sm font-bold text-slate-500 mb-6">مفاتيح API للتطبيق (Android)</h2>
        <form onSubmit={generateApiKey} className="flex flex-col sm:flex-row gap-4 mb-6">
          <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="اسم المفتاح (مثال: تطبيق اندرويد)" className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:border-slate-400 focus:bg-white outline-none font-bold text-sm" required />
          <button type="submit" className="bg-slate-900 text-white font-black px-6 py-3 rounded-xl hover:bg-slate-800 transition-colors shadow-md text-sm">إنشاء مفتاح</button>
        </form>
        
        {apiKeys.length > 0 && (
          <div className="space-y-3">
            {apiKeys.map(k => (
              <div key={k.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div>
                  <div className="font-black text-sm text-slate-800">{k.name}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{new Date(k.createdAt).toLocaleString()}</div>
                </div>
                <div className="font-mono text-xs bg-slate-200 text-slate-800 px-3 py-2 rounded-lg truncate select-all">{k.key}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-100 shadow-sm">
        <h2 className="text-sm font-bold text-slate-500 mb-6">سجل المباريات</h2>
        <div className="space-y-4">
          {matches.map(m => (
            <MatchAdminItem key={m.id} match={m} onComplete={completeMatch} />
          ))}
        </div>
      </div>

      <div className="bg-red-50 p-4 sm:p-8 rounded-2xl border border-red-200 shadow-sm mt-8">
        <h2 className="text-sm font-bold text-red-700 mb-4">منطقة خطرة (Danger Zone)</h2>
        <p className="text-xs text-red-600 mb-6 font-bold leading-relaxed">
          تنظيف قاعدة البيانات للمباريات وحسابات اللاعبين السابقة فقط. سيتم حذف جميع حسابات اللاعبين (ما عدا المشرفين)، وكل توقعاتهم، والمباريات المكتملة السابقة بشكل نهائي لتبدأ البطولة/الحدث الجديد بصفحة بيضاء. لن يتم حذف المباريات القادمة Pending.
        </p>
        <button 
          onClick={clearDatabase} 
          className="bg-red-600 text-white font-black px-6 py-3 rounded-xl hover:bg-red-700 transition-colors shadow-md text-sm w-full sm:w-auto"
        >
          تنظيف المباريات السابقة وحذف جميع حسابات اللاعبين
        </button>
      </div>
    </div>
  );
}

function MatchAdminItem({ match, onComplete }: { match: Match, onComplete: (m: Match, h: number, a: number) => void }) {
  const [h, setH] = useState<string>('');
  const [a, setA] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (match.status === 'completed') {
    return (
      <div className="p-4 border border-emerald-200 bg-emerald-50 flex items-center justify-between rounded-xl">
        <span className="font-black text-slate-700 text-base">{match.homeTeam} {match.homeScore} • {match.awayScore} {match.awayTeam}</span>
        <span className="text-[10px] px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold">مكتمل</span>
      </div>
    );
  }

  const handleComplete = async () => {
    const hNum = parseInt(h);
    const aNum = parseInt(a);
    if (isNaN(hNum) || isNaN(aNum)) {
      setErrorMsg('نتيجة غير صحيحة');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    
    setLoading(true);
    await onComplete(match, hNum, aNum);
    setLoading(false);
    setConfirming(false);
  };

  return (
    <div className="p-4 border border-slate-200 flex flex-col xl:flex-row items-center justify-between gap-6 rounded-xl bg-slate-50 relative">
      <div className="flex flex-col items-center xl:items-start text-center xl:text-right w-full xl:w-auto">
        <div className="font-black text-lg text-slate-800">{match.homeTeam} <span className="text-slate-400 mx-2 text-sm">ضد</span> {match.awayTeam}</div>
        <div className="text-[10px] text-amber-600 font-bold mt-1">موعد الإغلاق: {new Date(match.cutoffTime).toLocaleString()}</div>
      </div>
      <div className="flex items-center space-x-3 space-x-reverse w-full xl:w-auto overflow-x-auto pb-2 xl:pb-0 justify-center xl:justify-start">
        {errorMsg && <span className="text-xs font-bold text-red-500 absolute top-2 right-2">{errorMsg}</span>}
        <input type="number" placeholder="مضيف" value={h} onChange={e => {setH(e.target.value); setConfirming(false);}} className="w-16 h-12 border border-slate-200 rounded-xl text-center font-black text-lg outline-none focus:border-slate-400 bg-white" min={0} />
        <span className="text-slate-300 font-bold">:</span>
        <input type="number" placeholder="ضيف" value={a} onChange={e => {setA(e.target.value); setConfirming(false);}} className="w-16 h-12 border border-slate-200 rounded-xl text-center font-black text-lg outline-none focus:border-slate-400 bg-white" min={0} />
        
        {confirming && (
          <button 
            onClick={() => setConfirming(false)} 
            disabled={loading}
            className="px-4 h-12 bg-slate-200 text-slate-700 font-black text-xs rounded-xl hover:bg-slate-300 transition-colors mr-2 cursor-pointer"
          >
            إلغاء
          </button>
        )}
        
        <button 
          onClick={handleComplete} 
          disabled={loading}
          className={`px-6 h-12 ${confirming ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'} text-white font-black text-xs rounded-xl disabled:opacity-50 transition-colors mr-2 shadow-md cursor-pointer disabled:cursor-not-allowed`}
        >
          {loading ? 'جاري...' : confirming ? 'تأكيد وحفظ!' : 'حفظ النتيجة'}
        </button>
      </div>
    </div>
  );
}
