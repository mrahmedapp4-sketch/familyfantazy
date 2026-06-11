import React, { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, getDocs, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Match, Prediction } from '../types';
import { notify } from '../lib/notifications';

export default function MatchesList() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const initialLoad = useRef(true);

  useEffect(() => {
    const qMatches = query(collection(db, 'matches'), orderBy('createdAt', 'desc'));
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      if (initialLoad.current) {
        initialLoad.current = false;
      } else {
        // notify('تم تحديث قائمة المباريات', 'info');
      }
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    });

    if (!auth.currentUser) return;

    const qPreds = query(collection(db, 'predictions'), where('userId', '==', auth.currentUser.uid));
    const unsubPreds = onSnapshot(qPreds, (snapshot) => {
      const predsMap: Record<string, Prediction> = {};
      snapshot.docs.forEach(d => {
        const pred = { id: d.id, ...d.data() } as Prediction;
        predsMap[pred.matchId] = pred;
      });
      setPredictions(predsMap);
    });

    return () => {
      unsubMatches();
      unsubPreds?.();
    };
  }, []);

  const pendingMatches = matches.filter(m => m.status === 'pending');
  const completedMatches = matches.filter(m => m.status === 'completed');

  return (
    <div className="w-full max-w-2xl mx-auto space-y-12 pb-8">
      <div>
        <h2 className="text-sm font-bold text-slate-500 mb-6 px-2">توقعات المباريات القادمة</h2>
        <div className="space-y-6">
          {pendingMatches.map(m => (
            <MatchCard key={m.id} match={m} userPrediction={predictions[m.id]} />
          ))}
          {pendingMatches.length === 0 && (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 text-slate-400 font-bold text-sm shadow-sm">لا توجد مباريات متاحة حالياً.</div>
          )}
        </div>
      </div>

      {completedMatches.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-slate-500 mb-6 px-2">نتائج المباريات السابقة</h2>
          <div className="space-y-6">
            {completedMatches.map(m => (
              <MatchCard key={m.id} match={m} userPrediction={predictions[m.id]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, userPrediction }: { match: Match, userPrediction?: Prediction }) {
  const [h, setH] = useState<number | ''>(userPrediction?.homeScore ?? '');
  const [a, setA] = useState<number | ''>(userPrediction?.awayScore ?? '');
  const [loading, setLoading] = useState(false);
  const [isClosed, setIsClosed] = useState(Date.now() > match.cutoffTime || match.status === 'completed');

  useEffect(() => {
    if (userPrediction) {
      setH(userPrediction.homeScore);
      setA(userPrediction.awayScore);
    }
  }, [userPrediction]);

  useEffect(() => {
    if (match.status === 'completed') {
      setIsClosed(true);
      return;
    }
    const timeRemaining = Number(match.cutoffTime) - Date.now();
    if (timeRemaining <= 0) {
      setIsClosed(true);
      return;
    }
    setIsClosed(false);
    const timeoutId = setTimeout(() => {
      setIsClosed(true);
      notify(`انتهى وقت التوقع لمباراة: ${match.homeTeam} ضد ${match.awayTeam}`, 'warning');
    }, timeRemaining);
    return () => clearTimeout(timeoutId);
  }, [match.cutoffTime, match.status, match.homeTeam, match.awayTeam]);

  const handleSubmit = async () => {
    if (!auth.currentUser) return alert('الرجاء تسجيل الدخول أولا.');
    if (h === '' || a === '') return;
    if (isClosed) return alert('عذراً، انتهى وقت التوقع لهذه المباراة.');

    setLoading(true);
    try {
      if (userPrediction) {
        await updateDoc(doc(db, 'predictions', userPrediction.id), {
          homeScore: h,
          awayScore: a,
          updatedAt: Date.now()
        });
      } else {
        await addDoc(collection(db, 'predictions'), {
          matchId: match.id,
          userId: auth.currentUser.uid,
          homeScore: h,
          awayScore: a,
          points: 0,
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      alert('تم حفظ التوقع بنجاح!');
    } catch (e: any) {
      alert('خطأ في حفظ التوقع: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 relative flex flex-col shadow-sm">
      {match.hasEgypt && (
        <div className="absolute top-0 right-8 bg-amber-400 text-amber-900 text-[10px] font-black px-4 py-1.5 rounded-b-xl shadow-sm">
          مكافأة مصر: 5 نقاط
        </div>
      )}
      <div className="flex flex-col items-center">
        <div className="text-xs font-bold text-slate-400 mb-6 text-center w-full pb-4 border-b border-slate-50 flex flex-col sm:flex-row justify-center sm:space-x-4 sm:space-x-reverse gap-2">
          <span>المباراة: {new Date(match.kickoffTime).toLocaleString()}</span>
          {!isClosed && <span className="hidden sm:inline text-slate-300">•</span>}
          {!isClosed && <span className="text-amber-500">يُغلق: {new Date(match.cutoffTime).toLocaleTimeString()}</span>}
        </div>
        
        <div className="flex items-center justify-center space-x-6 space-x-reverse w-full mb-8">
          <div className="flex flex-col items-center flex-1 min-w-0">
            <div className="text-2xl sm:text-4xl font-black text-slate-800 text-center truncate w-full">{match.homeTeam}</div>
          </div>
          <div className="px-2 text-slate-300 font-black text-xl sm:text-2xl truncate min-w-0">:</div>
          <div className="flex flex-col items-center flex-1 min-w-0">
            <div className="text-2xl sm:text-4xl font-black text-slate-800 text-center truncate w-full">{match.awayTeam}</div>
          </div>
        </div>

        {match.status === 'completed' ? (
           <div className="flex items-center justify-center space-x-4 space-x-reverse mb-6 mt-2">
            <div className="text-4xl sm:text-5xl font-black text-slate-900 bg-slate-50 rounded-2xl w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center border border-slate-100">{match.homeScore}</div>
            <div className="text-slate-300 font-bold text-xl sm:text-2xl">-</div>
            <div className="text-4xl sm:text-5xl font-black text-slate-900 bg-slate-50 rounded-2xl w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center border border-slate-100">{match.awayScore}</div>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-4 space-x-reverse mb-8 mt-2">
            <input 
              type="number" 
              placeholder="0"
              min={0}
              className="w-24 h-24 sm:w-28 sm:h-28 border border-slate-200 rounded-2xl text-center text-4xl sm:text-5xl font-black focus:border-slate-400 focus:bg-white outline-none bg-slate-50 transition-all disabled:opacity-50"
              value={h}
              onChange={e => setH(parseInt(e.target.value))}
              disabled={isClosed || loading}
            />
            <span className="text-slate-300 font-bold text-xl sm:text-2xl">-</span>
            <input 
              type="number" 
              placeholder="0"
              min={0}
              className="w-24 h-24 sm:w-28 sm:h-28 border border-slate-200 rounded-2xl text-center text-4xl sm:text-5xl font-black focus:border-slate-400 focus:bg-white outline-none bg-slate-50 transition-all disabled:opacity-50"
              value={a}
              onChange={e => setA(parseInt(e.target.value))}
              disabled={isClosed || loading}
            />
          </div>
        )}

        {match.status === 'completed' && userPrediction && (
          <div className="w-full bg-slate-900 text-white rounded-2xl p-6 text-center mt-2 flex flex-col items-center justify-center shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <span className="text-xs font-bold mb-2 text-slate-300 z-10">توقعك المسجل</span>
            <span className="text-3xl font-black z-10">{userPrediction.homeScore} - {userPrediction.awayScore}</span>
            <div className="mt-4 w-full pt-4 border-t border-slate-700 flex items-center justify-center z-10">
              <span className="text-emerald-400 font-black text-sm">+{userPrediction.points} نقاط تم إضافتها لك</span>
            </div>
          </div>
        )}

        {match.status === 'completed' && !userPrediction && (
          <div className="w-full bg-slate-50 rounded-2xl p-6 text-center text-xs font-bold text-slate-400 border border-slate-100 mt-2">
            لم تقم بتوقع هذه المباراة.
          </div>
        )}

        {match.status === 'pending' && (
          <button 
            onClick={handleSubmit} 
            disabled={isClosed || loading}
            className="w-full bg-slate-900 text-white py-4 font-black text-sm rounded-2xl hover:bg-slate-800 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed mt-2 hover:-translate-y-0.5 active:translate-y-0"
          >
            {isClosed ? 'انتهى وقت التوقع' : userPrediction ? 'تحديث التوقع' : 'تأكيد التوقع'}
          </button>
        )}
      </div>
    </div>
  );
}
