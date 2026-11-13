import {
  AlignLeft, Baby, Bot, Brain, Briefcase, Building2, Code2, Coffee, Expand, Feather, FileText, GraduationCap, Hash,
  HeartHandshake, Laugh, Landmark, Languages, Leaf, Lightbulb, Mail, Maximize2, MessageSquare, Minimize2, MoreHorizontal,
  Palette, PenLine, Reply, Rocket, Smile, Sparkles, SpellCheck, Target, Wand2, type LucideIcon, type LucideProps,
} from 'lucide-react';

/**
 * Explicit registry of icons referenced by name in @verba/shared catalogs and
 * custom assistants. Kept explicit (not `import { icons }`) so the bundle only
 * ships what we use.
 */
const ICONS: Record<string, LucideIcon> = {
  AlignLeft, Baby, Bot, Brain, Briefcase, Building2, Code2, Coffee, Expand, Feather, FileText, GraduationCap, Hash,
  HeartHandshake, Laugh, Landmark, Languages, Leaf, Lightbulb, Mail, Maximize2, MessageSquare, Minimize2, MoreHorizontal,
  Palette, PenLine, Reply, Rocket, Smile, Sparkles, SpellCheck, Target, Wand2,
};

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = ICONS[name] ?? Sparkles;
  return <Cmp aria-hidden {...props} />;
}
