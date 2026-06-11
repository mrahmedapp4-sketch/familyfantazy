import React, { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from '../types';
import { notify } from '../lib/notifications';

export default function Leaderboard() {
  const [users, setUsers] = useState<User[]>([]);
  const initialLoad = useRef(true);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('totalPoints', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snapshot) => {
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      const filtered = allUsers.filter(u => {
        const email = (u.email || '').toLowerCase().trim();
        return email !== 'mrahmedapp4@gmail.com' && email !== 'admin@user.familyfantasy.com';
      });
      setUsers(filtered);
      if (initialLoad.current) {
        initialLoad.current = false;
      } else {
        notify('تغير في لوحة الصدارة!', 'success');
      }
    });
    return unsub;
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col">
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col">
        <div className="p-6 border-b border-slate-50">
          <h2 className="text-sm font-bold text-slate-500">الترتيب العام</h2>
        </div>
        <div className="p-4 space-y-2">
          {users.map((user, idx) => (
            <div key={user.id} className={`flex items-center p-4 rounded-xl transition-all ${idx === 0 ? 'bg-slate-900 text-white shadow-md transform hover:-translate-y-0.5' : 'bg-slate-50 border border-slate-100 hover:bg-slate-100'}`}>
              <span className={`w-10 text-xs font-black ${idx === 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {(idx + 1).toString().padStart(2, '0')}
              </span>
              <span className="flex-1 text-base font-bold">{user.displayName}</span>
              <span className={`text-xl font-black ${idx === 0 ? 'text-white' : 'text-slate-800'}`}>{user.totalPoints}</span>
            </div>
          ))}
          {users.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400 font-bold border-2 border-dashed border-slate-100 mt-4 rounded-xl">لا يوجد مشاركين حتى الآن.</div>
          )}
        </div>
      </div>
    </div>
  );
}
