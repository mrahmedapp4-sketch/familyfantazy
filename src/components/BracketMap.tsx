import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function BracketMap() {
  const [nodes, setNodes] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'bracket', 'main'), (d) => {
      if (d.exists()) {
        setNodes(d.data().nodes || {});
      }
    });
    return unsub;
  }, []);

  return (
    <div className="w-full flex flex-col bg-white border border-slate-100 rounded-2xl shadow-sm" dir="ltr">
      <div className="p-6 border-b border-slate-50">
        <h2 className="text-sm font-bold text-slate-500 text-center" dir="rtl">خريطة البطولة</h2>
      </div>
      <div className="w-full overflow-x-auto p-4 sm:p-8">
        <div className="min-w-[800px] max-w-[900px] mx-auto h-[500px] relative flex justify-between items-stretch bg-slate-50 border border-slate-100 rounded-2xl p-6">
          
          {/* Quarter Finals */}
          <div className="flex flex-col justify-around w-32 z-10 relative">
            <BracketNode match={nodes['QF1'] || 'ربع نهائي 1'} />
            <BracketNode match={nodes['QF3'] || 'ربع نهائي 3'} />
          </div>

          {/* Semi Finals */}
          <div className="flex flex-col justify-around w-32 z-10 relative px-4">
            <BracketNode match={nodes['SF1'] || 'نصف نهائي 1'} />
          </div>

          {/* Final */}
          <div className="flex flex-col justify-center w-48 z-10 relative px-4">
            <div className="w-full h-28 border-[3px] border-amber-400 flex flex-col items-center justify-center bg-white rounded-2xl shadow-lg relative">
              <div className="text-[10px] font-black text-amber-500 tracking-wider mb-2" dir="rtl">بطل العالم</div>
              <div className="flex flex-col items-center justify-center w-full px-2 text-center text-sm font-black text-slate-800">
                {nodes['Final'] || 'لم يحدد بعد'}
              </div>
            </div>
          </div>

          {/* Semi Finals Right */}
          <div className="flex flex-col justify-around w-32 z-10 relative px-4">
            <BracketNode match={nodes['SF2'] || 'نصف نهائي 2'} align="right" />
          </div>

          {/* Quarter Finals Right */}
          <div className="flex flex-col justify-around w-32 z-10 relative">
            <BracketNode match={nodes['QF2'] || 'ربع نهائي 2'} align="right" />
            <BracketNode match={nodes['QF4'] || 'ربع نهائي 4'} align="right" />
          </div>
          
        </div>
      </div>
    </div>
  );
}

function BracketNode({ match, align = 'left' }: { match: string, align?: 'left' | 'right' }) {
  return (
    <div className={`w-full py-4 px-2 border border-slate-300 rounded-xl flex items-center justify-center text-xs font-bold text-slate-700 bg-white shadow-sm relative text-center min-h-[3rem] 
      ${align === 'right' 
        ? "after:content-[''] after:absolute after:w-4 after:h-[2px] after:bg-slate-300 after:-left-4" 
        : "after:content-[''] after:absolute after:w-4 after:h-[2px] after:bg-slate-300 after:-right-4"}`}>
      {match}
    </div>
  );
}
