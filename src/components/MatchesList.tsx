import React, { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, getDocs, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Match, Prediction, User } from '../types';
import { notify } from '../lib/notifications';
import { canPredict } from '../lib/admin';

export default function MatchesList({ user }: { user?: User | null }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});
  const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);
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

    // Real-time listener for all user details
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      const uMap: Record<string, User> = {};
      snapshot.docs.forEach(d => {
        uMap[d.id] = { id: d.id, ...d.data() } as User;
      });
      setUsersMap(uMap);
    });

    // Real-time listener for all predictions across the app
    const unsubAllPreds = onSnapshot(query(collection(db, 'predictions')), (snapshot) => {
      setAllPredictions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Prediction)));
    });

    if (!auth.currentUser) return () => {
      unsubMatches();
      unsubUsers();
      unsubAllPreds();
    };

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
      unsubUsers();
      unsubAllPreds();
      unsubPreds?.();
    };
  }, []);

  const pendingMatches = matches.filter(m => m.status === 'pending');
  const completedMatches = matches.filter(m => m.status === 'completed');

  return (
    <div className="w-full max-w-2xl mx-auto space-y-12 pb-8">
      <div>
        <h2 className="text-sm font-bold text-slate-500 mb-6 px-2">توقعات المباريات القادمة</h2>
        <div className="space-y-6 font-sans">
          {pendingMatches.map(m => (
            <MatchCard 
              key={m.id} 
              match={m} 
              userPrediction={predictions[m.id]} 
              user={user} 
              usersMap={usersMap}
              matchPredictions={allPredictions.filter(p => p.matchId === m.id)}
            />
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
              <MatchCard 
                key={m.id} 
                match={m} 
                userPrediction={predictions[m.id]} 
                user={user} 
                usersMap={usersMap}
                matchPredictions={allPredictions.filter(p => p.matchId === m.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({ 
  match, 
  userPrediction, 
  user,
  usersMap,
  matchPredictions = []
}: { 
  match: Match, 
  userPrediction?: Prediction, 
  user?: User | null,
  usersMap: Record<string, User>,
  matchPredictions: Prediction[]
}) {
  const [h, setH] = useState<number | ''>(userPrediction?.homeScore ?? '');
  const [a, setA] = useState<number | ''>(userPrediction?.awayScore ?? '');
  const [isPrivateState, setIsPrivateState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isClosed, setIsClosed] = useState(Date.now() > match.cutoffTime || match.status === 'completed');
  const [timeLeft, setTimeLeft] = useState<{days: number, hours: number, minutes: number, seconds: number} | null>(null);

  const isAllowedToPredict = canPredict(user?.email || auth.currentUser?.email, user?.displayName);
  const isAdminUser = !isAllowedToPredict;

  useEffect(() => {
    if (userPrediction) {
      setH(userPrediction.homeScore);
      setA(userPrediction.awayScore);
      setIsPrivateState(!!userPrediction.isPrivate);
    }
  }, [userPrediction]);

  useEffect(() => {
    if (match.status === 'completed') {
      setIsClosed(true);
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const difference = Number(match.cutoffTime) - now;

      if (difference <= 0) {
        setIsClosed(true);
        setTimeLeft(null);
        return false;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
      setIsClosed(false);
      return true;
    };

    const isRunning = updateTimer();
    if (!isRunning) return;

    const intervalId = setInterval(() => {
      const stillRunning = updateTimer();
      if (!stillRunning) {
        clearInterval(intervalId);
        notify(`انتهى وقت التوقع لمباراة: ${match.homeTeam} ضد ${match.awayTeam}`, 'warning');
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [match.cutoffTime, match.status, match.homeTeam, match.awayTeam]);

  const handleSubmit = async () => {
    if (!auth.currentUser) return alert('الرجاء تسجيل الدخول أولا.');
    if (isAdminUser) return alert('بصفتك مديراً، لا يمكنك المشاركة في التوقعات.');
    if (h === '' || a === '') return;
    if (isClosed) return alert('عذراً، انتهى وقت التوقع لهذه المباراة.');

    setLoading(true);
    try {
      if (userPrediction) {
        await updateDoc(doc(db, 'predictions', userPrediction.id), {
          homeScore: h,
          awayScore: a,
          isPrivate: isPrivateState,
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
          isPrivate: isPrivateState,
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

  const otherPredictions = matchPredictions.filter(p => p.userId !== auth.currentUser?.uid);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 relative flex flex-col shadow-sm">
      {match.hasEgypt && (
        <div className="absolute top-0 right-8 bg-amber-400 text-amber-900 text-[10px] font-black px-4 py-1.5 rounded-b-xl shadow-sm z-10">
          مكافأة مصر: 5 نقاط
        </div>
      )}
      <div className="flex flex-col items-center">
        <div className="text-xs font-bold text-slate-400 mb-4 text-center w-full pb-4 border-b border-slate-50 flex flex-col sm:flex-row justify-center sm:space-x-4 sm:space-x-reverse gap-2">
          <span>المباراة: {new Date(match.kickoffTime).toLocaleString()}</span>
          {!isClosed && <span className="hidden sm:inline text-slate-300">•</span>}
          {!isClosed && <span className="text-amber-500">يُغلق: {new Date(match.cutoffTime).toLocaleTimeString()}</span>}
        </div>

        {/* Dynamic Countdown Timer Display */}
        {timeLeft && match.status !== 'completed' && (
          <div className="mb-6 flex flex-col items-center justify-center bg-amber-50/50 border border-amber-100 rounded-2xl px-6 py-2.5 w-full max-w-sm shadow-sm">
            <span className="text-[10px] font-black text-amber-600 mb-1.5">الوقت المتبقي للتوقع والاشتراك:</span>
            <div className="flex items-center gap-3">
              {timeLeft.days > 0 && (
                <>
                  <div className="flex flex-col items-center">
                    <span className="font-mono text-sm sm:text-base font-black text-slate-800 leading-none">{timeLeft.days}</span>
                    <span className="text-[8px] text-slate-400 mt-0.5 font-bold">يوم</span>
                  </div>
                  <span className="text-amber-300 font-bold text-xs -mt-2">:</span>
                </>
              )}
              <div className="flex flex-col items-center">
                <span className="font-mono text-sm sm:text-base font-black text-slate-800 leading-none">{String(timeLeft.hours).padStart(2, '0')}</span>
                <span className="text-[8px] text-slate-400 mt-0.5 font-bold">ساعة</span>
              </div>
              <span className="text-amber-300 font-bold text-xs -mt-2">:</span>
              <div className="flex flex-col items-center">
                <span className="font-mono text-sm sm:text-base font-black text-slate-800 leading-none">{String(timeLeft.minutes).padStart(2, '0')}</span>
                <span className="text-[8px] text-slate-400 mt-0.5 font-bold">دقيقة</span>
              </div>
              <span className="text-amber-300 font-bold text-xs -mt-2">:</span>
              <div className="flex flex-col items-center">
                <span className="font-mono text-sm sm:text-base font-black text-amber-600 leading-none animate-pulse">{String(timeLeft.seconds).padStart(2, '0')}</span>
                <span className="text-[8px] text-slate-400 mt-0.5 font-bold">ثانية</span>
              </div>
            </div>
          </div>
        )}

        {isClosed && match.status === 'pending' && (
          <div className="mb-6 bg-red-50 border border-red-100 rounded-2xl px-6 py-2 w-full max-w-sm text-center text-xs font-black text-red-600">
            تم إغلاق التوقع لهذه المباراة
          </div>
        )}
        
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
           <div className="flex items-center justify-center space-x-4 space-x-reverse mb-6 mt-2 flex-row-reverse">
            <div className="text-4xl sm:text-5xl font-black text-slate-900 bg-slate-50 rounded-2xl w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center border border-slate-100">{match.homeScore}</div>
            <div className="text-slate-300 font-bold text-xl sm:text-2xl">-</div>
            <div className="text-4xl sm:text-5xl font-black text-slate-900 bg-slate-50 rounded-2xl w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center border border-slate-100">{match.awayScore}</div>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-4 space-x-reverse mb-8 mt-2 flex-row-reverse">
            <input 
              type="number" 
              placeholder="0"
              min={0}
              className="w-24 h-24 sm:w-28 sm:h-28 border border-slate-200 rounded-2xl text-center text-4xl sm:text-5xl font-black focus:border-slate-400 focus:bg-white outline-none bg-slate-50 transition-all disabled:opacity-50 text-slate-800"
              value={h}
              onChange={e => setH(e.target.value === '' ? '' : parseInt(e.target.value))}
              disabled={isClosed || loading || isAdminUser}
            />
            <span className="text-slate-300 font-bold text-xl sm:text-2xl">-</span>
            <input 
              type="number" 
              placeholder="0"
              min={0}
              className="w-24 h-24 sm:w-28 sm:h-28 border border-slate-200 rounded-2xl text-center text-4xl sm:text-5xl font-black focus:border-slate-400 focus:bg-white outline-none bg-slate-50 transition-all disabled:opacity-50 text-slate-800"
              value={a}
              onChange={e => setA(e.target.value === '' ? '' : parseInt(e.target.value))}
              disabled={isClosed || loading || isAdminUser}
            />
          </div>
        )}

        {match.status === 'completed' && userPrediction && (
          <div className="w-full bg-slate-900 text-white rounded-2xl p-6 text-center mt-2 flex flex-col items-center justify-center shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <span className="text-xs font-bold mb-2 text-slate-300 z-10">توقعك المسجل</span>
            <span className="text-3xl font-black z-10 font-mono tracking-wider">{userPrediction.homeScore} - {userPrediction.awayScore}</span>
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
          isAdminUser ? (
            <div className="w-full bg-slate-50 text-slate-400 py-4 font-black text-xs rounded-2xl text-center border border-slate-100 mt-2">
              حساب المدير معفي من مشاركة التوقعات
            </div>
          ) : (
            <div className="w-full space-y-4">
              {/* Eye toggle component */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-2xl w-full" dir="rtl">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5 selection:bg-transparent">
                  {isPrivateState ? (
                    <>
                      <span className="text-red-500 font-bold shrink-0">🔒</span>
                      <span>توقعك مخفي عن الآخرين</span>
                    </>
                  ) : (
                    <>
                      <span className="text-emerald-500 font-bold shrink-0">👁️</span>
                      <span>توقعك مرئي للجميع لزيادة الحماس</span>
                    </>
                  )}
                </span>
                <button
                  onClick={async () => {
                    const nextVal = !isPrivateState;
                    if (userPrediction) {
                      setLoading(true);
                      try {
                        await updateDoc(doc(db, 'predictions', userPrediction.id), {
                          isPrivate: nextVal,
                          updatedAt: Date.now()
                        });
                        setIsPrivateState(nextVal);
                      } catch (err: any) {
                        alert('خطأ في تعديل الخصوصية: ' + err.message);
                      } finally {
                        setLoading(false);
                      }
                    } else {
                      setIsPrivateState(nextVal);
                    }
                  }}
                  type="button"
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm border ${
                    isPrivateState 
                      ? 'bg-slate-900 border-slate-950 text-white hover:bg-slate-800' 
                      : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                  }`}
                  title={isPrivateState ? "اضغط لجعله مرئياً للجميع" : "اضغط لإخفاء توقعك عن الآخرين"}
                >
                  {isPrivateState ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>إظهار التوقع</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 text-slate-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                      <span>إخفاء التوقع</span>
                    </>
                  )}
                </button>
              </div>

              <button 
                onClick={handleSubmit} 
                disabled={isClosed || loading}
                className="w-full bg-slate-900 text-white py-4 font-black text-sm rounded-2xl hover:bg-slate-800 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                {isClosed ? 'انتهى وقت التوقع' : userPrediction ? 'تحديث التوقع' : 'تأكيد التوقع'}
              </button>
            </div>
          )
        )}

        {/* List of other family members' predictions */}
        {otherPredictions.length > 0 && (
          <div className="w-full mt-6 pt-6 border-t border-slate-100 flex flex-col items-start text-right" dir="rtl">
            <h4 className="text-xs font-black text-slate-400 mb-4 flex items-center justify-between w-full">
              <span>توقعات بقية المشاركين ({otherPredictions.length}):</span>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full">تحديث فوري ⚡</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {otherPredictions.map(p => {
                const predictedUser = usersMap[p.userId];
                if (!predictedUser) return null;

                const isHiddenFromUs = p.isPrivate && !isAdminUser;
                return (
                  <div key={p.id} className="flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 p-3 rounded-2xl border border-slate-100 transition-all w-full">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                      <span className="truncate">{predictedUser.displayName}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {isHiddenFromUs ? (
                        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg flex items-center gap-1 border border-slate-200">
                          <span>توقع مخفي</span>
                          <span className="text-red-400 text-xs">🔒</span>
                        </span>
                      ) : (
                        <span className="text-xs font-black text-slate-900 bg-white border border-slate-200 px-3 py-1 rounded-lg min-w-[55px] text-center shadow-xs font-mono tracking-wider">
                          {p.homeScore} - {p.awayScore}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
