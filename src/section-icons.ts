import { BookOpen, Brain, Briefcase, Building2, ClipboardList, Code2, Compass, Cpu, Database, Dumbbell, FileText, FolderKanban, Globe, GraduationCap, Handshake, Heart, Languages, Layers, Lightbulb, ListChecks, MessageSquare, Network, PenLine, Plane, Presentation, Puzzle, Rocket, Server, Sigma, Star, Target, Terminal, Trophy, Users, Utensils, Wrench, Zap, type LucideIcon } from 'lucide-react';

export const sectionIcons: Record<string,LucideIcon> = {
  'file-text':FileText,'message-square':MessageSquare,'folder-kanban':FolderKanban,code:Code2,building:Building2,'pen-line':PenLine,
  book:BookOpen,brain:Brain,briefcase:Briefcase,clipboard:ClipboardList,compass:Compass,cpu:Cpu,database:Database,globe:Globe,
  graduation:GraduationCap,handshake:Handshake,heart:Heart,languages:Languages,layers:Layers,lightbulb:Lightbulb,checklist:ListChecks,
  network:Network,presentation:Presentation,puzzle:Puzzle,rocket:Rocket,server:Server,sigma:Sigma,star:Star,target:Target,
  terminal:Terminal,trophy:Trophy,dumbbell:Dumbbell,plane:Plane,utensils:Utensils,users:Users,wrench:Wrench,zap:Zap,
};
// A backup may name an icon this version does not ship; it still needs to render.
export const sectionIcon = (name: string): LucideIcon => sectionIcons[name] || FileText;
