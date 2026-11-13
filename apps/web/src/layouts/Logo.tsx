import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)} aria-label="Verba home">
      <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-[10px] shadow-glow" />
      <span className="text-[17px] font-semibold tracking-tight text-fg">Verba</span>
    </Link>
  );
}
