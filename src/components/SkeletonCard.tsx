import React from 'react';

export default function SkeletonCard() {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-4 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-zinc-800 rounded-full"></div>
          <div className="space-y-2">
            <div className="h-4 w-24 bg-zinc-800 rounded"></div>
            <div className="h-3 w-16 bg-zinc-800 rounded"></div>
          </div>
        </div>
        <div className="h-4 w-20 bg-zinc-800 rounded"></div>
      </div>
      
      <div className="space-y-3 mb-6">
        <div className="h-4 w-full bg-zinc-800 rounded"></div>
        <div className="h-4 w-full bg-zinc-800 rounded"></div>
        <div className="h-4 w-2/3 bg-zinc-800 rounded"></div>
      </div>
      
      <div className="h-16 w-full bg-zinc-800/50 rounded-xl mb-4"></div>
      
      <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
        <div className="flex space-x-4">
          <div className="h-5 w-12 bg-zinc-800 rounded-full"></div>
          <div className="h-5 w-12 bg-zinc-800 rounded-full"></div>
        </div>
        <div className="h-5 w-8 bg-zinc-800 rounded-full"></div>
      </div>
    </div>
  );
}
