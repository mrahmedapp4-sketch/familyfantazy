import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { User } from './types';

import MatchesList from './components/MatchesList';
import Leaderboard from './components/Leaderboard';
import BracketMap from './components/BracketMap';
import AdminPanel from './components/AdminPanel';

function NotificationToast() {
  const [notif, setNotif] = useState<{ message: string, type: string } | null>(null);

  useEffect(() => {
    const handleNotify = (e: any) => {
      setNotif(e.detail);
      setTimeout(() => setNotif(null), 4000);
    };
    window.addEventListener('app-notify', handleNotify);
    return () => window.removeEventListener('app-notify', handleNotify);
  }, []);

  if (!notif) return null;

  const bgColors: any = {
    info: 'bg-slate-900',
    success: 'bg-emerald-600',
    warning: 'bg-amber-500'
  };

  return (
    <div className={`fixed bottom-6 right-6 p-4 px-6 rounded-2xl shadow-xl z-50 text-white font-black text-sm transition-all animate-bounce ${bgColors[notif.type] || bgColors.info} border border-white/20`} dir="rtl">
      {notif.message}
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [showPrizesBar, setShowPrizesBar] = useState(() => !localStorage.getItem('ff_prizes_seen'));

  const dismissPrizes = () => {
    localStorage.setItem('ff_prizes_seen', 'true');
    setShowPrizesBar(false);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUser({ id: userSnap.id, ...userSnap.data() } as User);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSecretAdminLoginClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAdminPass('');
    setShowAdminPrompt(true);
  };

  const submitAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPass) return;
    if (adminPass === 'limbo') {
      setAdminLoading(true);
      try {
        const safeEmail = 'admin@user.familyfantasy.com';
        const fixedPassword = 'AdminSecretPassword2026!';
        if (auth.currentUser && auth.currentUser.email !== safeEmail) {
          await signOut(auth);
        }
        try {
          await signInWithEmailAndPassword(auth, safeEmail, fixedPassword);
        } catch (err: any) {
          if (err.code === 'auth/operation-not-allowed') {
            alert("يجب تفعيل تسجيل الدخول بالبريد الإلكتروني من لوحة تحكم Firebase.");
            setAdminLoading(false);
            return;
          }
          const cred = await createUserWithEmailAndPassword(auth, safeEmail, fixedPassword);
          await setDoc(doc(db, 'users', cred.user.uid), {
            displayName: 'المدير',
            email: safeEmail,
            totalPoints: 0,
            createdAt: Date.now()
          });
        }
        setShowAdminPrompt(false);
        window.location.href = '/admin';
      } catch (err: any) {
        alert("حدث خطأ أثناء الدخول: " + err.message);
      }
      setAdminLoading(false);
    } else {
      alert("كلمة المرور غير صحيحة!");
      setAdminLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500 font-bold">جاري التحميل...</div>;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans overflow-x-hidden relative">
        <NotificationToast />
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-6 sm:px-10 shrink-0 sticky top-0 z-50 shadow-sm">
          <Link to="/" className="flex items-center space-x-4 space-x-reverse">
            <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-xl shadow-md">
              <span className="font-black text-xl">FF</span>
            </div>
            <span onClick={handleSecretAdminLoginClick} className="text-xl font-black tracking-tight text-slate-800 cursor-pointer">FamilyFantasy</span>
          </Link>
          {auth.currentUser && (
            <div className="flex items-center space-x-4 space-x-reverse sm:space-x-6 sm:space-x-reverse">
              <div className="flex flex-col items-start hidden sm:flex">
                <span className="text-[10px] text-slate-400 font-bold tracking-widest">أهلاً بك</span>
                <span className="text-sm font-black text-slate-700">{user?.displayName || auth.currentUser.email}</span>
              </div>
              <div className="h-10 w-[1px] bg-slate-200 hidden sm:block"></div>
              {(auth.currentUser.email === 'mrahmedapp4@gmail.com' || auth.currentUser.email === 'admin@user.familyfantasy.com') && (
                <Link to="/admin" className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-2 px-4 rounded-xl transition-colors">
                  لوحة التحكم
                </Link>
              )}
              <div className="flex items-center space-x-2 space-x-reverse">
                <div 
                  className="bg-amber-100 text-amber-900 border border-amber-200 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
                  title="النقاط الإجمالية الحالية"
                >
                  <span>🏆</span>
                  <span>{user?.totalPoints ?? 0} {user?.totalPoints === 1 ? 'نقطة' : 'نقاط'}</span>
                </div>
                <button 
                  onClick={() => { if (window.confirm("هل تريد تسجيل الخروج؟")) signOut(auth); }} 
                  className="p-2.5 text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                  title="تسجيل الخروج"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </header>

        {auth.currentUser && showPrizesBar && (
          <div className="bg-white border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 text-xs gap-4 shadow-sm relative">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 flex-1">
              <div className="flex items-center space-x-2 space-x-reverse bg-slate-50 px-3 sm:px-4 py-2 rounded-xl">
                <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0"></span>
                <span className="font-black text-slate-600 whitespace-nowrap text-[10px] sm:text-xs">النتيجة الدقيقة: 3 نقاط</span>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse bg-slate-50 px-3 sm:px-4 py-2 rounded-xl">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="font-black text-slate-600 whitespace-nowrap text-[10px] sm:text-xs">توقع الفائز: 1 نقطة</span>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse bg-amber-50 px-3 sm:px-4 py-2 rounded-xl border border-amber-100">
                <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0"></span>
                <span className="font-black text-amber-700 whitespace-nowrap text-[10px] sm:text-xs">مباراة مصر: 5 نقاط لمطابقة النتيجة</span>
              </div>
            </div>
            <button 
              onClick={dismissPrizes}
              className="bg-slate-900 text-white font-black px-4 py-2 rounded-xl text-[10px] sm:text-xs hover:bg-slate-800 transition-colors shrink-0 shadow-md sm:w-auto w-full"
            >
              فهمت ذلك
            </button>
          </div>
        )}

        <main className="flex-1 flex flex-col p-4 sm:p-8 max-w-5xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<Home user={user} onUserCreated={setUser} />} />
            <Route path="/admin" element={<AdminRoute />} />
          </Routes>
        </main>

        {showAdminPrompt && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl relative border border-slate-100">
              <button 
                onClick={() => setShowAdminPrompt(false)}
                className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                title="إغلاق"
              >
                ✕
              </button>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-900 text-white flex items-center justify-center rounded-xl shadow-lg mb-4">
                  <span className="font-black text-xl">FF</span>
                </div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">تسجيل دخول الإدارة</h2>
                <p className="text-slate-500 text-xs font-bold mb-6 text-center">أدخل كلمة مرور الإدارة لفتح لوحة التحكم</p>
                
                <form onSubmit={submitAdminLogin} className="w-full space-y-4">
                  <input 
                    type="password"
                    placeholder="كلمة المرور"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm font-bold focus:border-slate-400 focus:bg-white outline-none transition-all placeholder:font-normal"
                    autoFocus
                  />
                  <button 
                    type="submit"
                    disabled={adminLoading}
                    className="w-full py-3 bg-slate-900 text-white text-sm font-black rounded-xl shadow-md hover:bg-slate-800 disabled:opacity-50 transition-all hover:-translate-y-0.5"
                  >
                    {adminLoading ? 'جاري الدخول...' : 'دخول مسار الإدارة'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </BrowserRouter>
  );
}

function Home({ user, onUserCreated }: { user: User | null, onUserCreated: (u: User) => void }) {
  if (!auth.currentUser || !user) return <LoginScreen onUserCreated={onUserCreated} />;
  return <Dashboard />;
}

function getDeviceId() {
  let deviceId = localStorage.getItem('ff_device_id');
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + "X9!";
    localStorage.setItem('ff_device_id', deviceId);
  }
  return deviceId;
}

function LoginScreen({ onUserCreated }: { onUserCreated: (u: User) => void }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loginWithUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setErrorMsg('الرجاء إدخال اسمك');
      return;
    }
    
    setLoading(true);
    try {
      const asciiName = Array.from(cleanName.toLowerCase()).map(c => c.charCodeAt(0).toString(16)).join('');
      const safeEmail = `u_${asciiName}@user.familyfantasy.com`;
      const fixedPasswordLegacy = 'FamilyFantasy2026!';
      const devicePassword = getDeviceId();
      
      let uid = '';
      try {
        const cred = await signInWithEmailAndPassword(auth, safeEmail, devicePassword);
        uid = cred.user.uid;
      } catch (err: any) {
        if (err.code === 'auth/operation-not-allowed') {
          throw new Error("يجب تفعيل تسجيل الدخول بالبريد الإلكتروني (Email/Password) من لوحة تحكم Firebase.");
        }
        
        try {
          // Try legacy password for existing accounts
          const credLegacy = await signInWithEmailAndPassword(auth, safeEmail, fixedPasswordLegacy);
          uid = credLegacy.user.uid;
          if (auth.currentUser) {
            await updatePassword(auth.currentUser, devicePassword);
          }
        } catch (legacyErr: any) {
          try {
            // User doesn't exist or wrong password entirely, try creating
            const credNew = await createUserWithEmailAndPassword(auth, safeEmail, devicePassword);
            uid = credNew.user.uid;
            
            const newUser: Omit<User, 'id'> = {
              displayName: cleanName,
              email: safeEmail,
              totalPoints: 0,
              createdAt: Date.now()
            };
            await setDoc(doc(db, 'users', uid), newUser);
            onUserCreated({ id: uid, ...newUser });
            setLoading(false);
            return;
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              throw new Error("هذا الاسم مستخدم بالفعل على جهاز آخر. يرجى اختيار اسم آخر أو متابعة الاسم الأصلي.");
            }
            throw createErr;
          }
        }
      }
      
      // If we reached here, user signed in directly
      const docSnap = await getDoc(doc(db, 'users', uid));
      if (docSnap.exists()) {
        onUserCreated({ id: uid, ...docSnap.data() } as User);
      } else {
        const newUser: Omit<User, 'id'> = {
          displayName: cleanName,
          email: safeEmail,
          totalPoints: 0,
          createdAt: Date.now()
        };
        await setDoc(doc(db, 'users', uid), newUser);
        onUserCreated({ id: uid, ...newUser });
      }
    } catch(err: any) {
      setErrorMsg("حدث خطأ أثناء الدخول: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] relative">
      <div className="w-full max-w-sm bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center">
        <div className="w-16 h-16 bg-slate-900 text-white flex items-center justify-center rounded-2xl shadow-lg mb-6">
          <span className="font-black text-3xl">FF</span>
        </div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-2">تسجيل الدخول</h1>
        <p className="text-slate-500 text-sm font-medium mb-8 text-center">أدخل اسمك لتبدأ المتعة والمنافسة</p>
        
        {errorMsg && (
          <div className="w-full bg-red-50 text-red-600 text-xs font-bold p-3 rounded-xl border border-red-100 mb-6 text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={loginWithUsername} className="w-full space-y-6">
          <div>
             <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="الاسم" 
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-base font-bold text-center focus:border-slate-400 focus:bg-white outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
              required
            />
          </div>
          <button 
            disabled={loading}
            type="submit" 
            className="w-full py-4 bg-slate-900 text-white text-base font-black rounded-2xl shadow-md hover:bg-slate-800 disabled:opacity-50 transition-all hover:-translate-y-1"
          >
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<'matches' | 'leaderboard' | 'bracket'>('matches');

  return (
    <div className="space-y-8">
      <div className="flex bg-white rounded-2xl shadow-sm border border-slate-100 w-full max-w-xl mx-auto overflow-hidden p-1 gap-1">
        <button onClick={() => setTab('matches')} className={`flex-1 py-3 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-black transition-all ${tab === 'matches' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>المباريات</button>
        <button onClick={() => setTab('leaderboard')} className={`flex-1 py-3 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-black transition-all ${tab === 'leaderboard' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>الترتيب</button>
        <button onClick={() => setTab('bracket')} className={`flex-1 py-3 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-black transition-all ${tab === 'bracket' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>الخريطة</button>
      </div>

      <div className="pt-2">
        {tab === 'matches' && <MatchesList />}
        {tab === 'leaderboard' && <Leaderboard />}
        {tab === 'bracket' && <BracketMap />}
      </div>
    </div>
  );
}

function AdminRoute() {
  const navigate = useNavigate();

  if (!auth.currentUser) {
    return (
      <div className="flex flex-col items-center justify-center p-10 mt-10">
        <div className="text-slate-500 font-bold text-lg mb-6">الرجاء تسجيل الدخول للوصول إلى لوحة الإدارة.</div>
        <button 
          onClick={() => navigate('/')}
          className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black shadow-md hover:bg-slate-800 transition-all hover:-translate-y-1"
        >
          العودة لصفحة الدخول
        </button>
      </div>
    );
  }
  if (auth.currentUser.email !== 'mrahmedapp4@gmail.com' && auth.currentUser.email !== 'admin@user.familyfantasy.com') {
    return (
      <div className="flex flex-col items-center justify-center p-10 mt-10">
        <div className="text-red-500 font-black text-xl mb-6">عذراً، لا تملك صلاحية الإدارة بحسابك الحالي.</div>
        <p className="text-slate-500 mb-8 font-bold text-center leading-relaxed">
          أنت مسجل الدخول كـ {auth.currentUser.email}.<br/>
          للدخول كمسؤول، اضغط على كلمة "FamilyFantasy" في أعلى الصفحة واكتب كلمة المرور الخاصة بالإدارة.
        </p>
        <button 
          onClick={() => navigate('/')}
          className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black shadow-md hover:bg-slate-800 transition-all hover:-translate-y-1"
        >
          العودة للرئيسية
        </button>
      </div>
    );
  }

  return <AdminPanel />;
}

export default App;

