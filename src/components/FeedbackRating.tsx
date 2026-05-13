import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';

interface FeedbackRatingProps {
  sessionId?: string;
}

export const FeedbackRating: React.FC<FeedbackRatingProps> = ({ sessionId }) => {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async () => {
    if (!rating || !auth.currentUser) return;
    
    setIsSending(true);
    try {
      const feedbackId = `fb_${Date.now()}_${auth.currentUser.uid.slice(0, 5)}`;
      await setDoc(doc(db, 'feedback', feedbackId), {
        userId: auth.currentUser.uid,
        sessionId: sessionId || 'unknown',
        rating,
        comment,
        timestamp: new Date().toISOString(),
        serverTime: serverTimestamp()
      });
      setIsSubmitted(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSending(false);
    }
  };

  if (isSubmitted) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900/80 backdrop-blur-xl border border-primary/20 p-4 rounded-2xl text-center"
      >
        <p className="text-[10px] font-black tracking-widest text-primary uppercase">Mera Dil Khush Hua! Shukriya!</p>
      </motion.div>
    );
  }

  return (
    <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 p-4 rounded-3xl flex flex-col gap-3 w-64 pointer-events-auto">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Aap ko Zara kaisi lagi?</p>
        <div className="flex gap-2">
          <button
            onClick={() => setRating('up')}
            className={`p-2 rounded-full transition-all ${rating === 'up' ? 'bg-primary text-black' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setRating('down')}
            className={`p-2 rounded-full transition-all ${rating === 'down' ? 'bg-red-500 text-white' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {rating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col gap-2 overflow-hidden"
          >
            <textarea
              placeholder="Kuch kehna chahengay? (Urdu/English)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="bg-black/50 border border-white/10 rounded-xl p-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 resize-none h-16 transition-all"
            />
            <Button
              onClick={handleSubmit}
              disabled={isSending}
              size="sm"
              className="w-full bg-primary text-black font-bold h-8 text-[10px] uppercase tracking-tighter"
            >
              {isSending ? 'Bhej rhi hoon...' : 'Feedback Bhejain'}
              <Send className="w-3 h-3 ml-2" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
