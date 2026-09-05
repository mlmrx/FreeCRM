import { publicPersonas } from './public-personas';

export const guideQuestions = [
  { title: 'Who will this CRM help?', options: [
    { id: 'solo', label: 'Just me', detail: 'Personal relationships or a one-person business.' },
    { id: 'business', label: 'My small business', detail: 'Sales, clients, delivery, and service.' },
    { id: 'enterprise', label: 'A larger organization', detail: 'Explore governance and team requirements.' },
    { id: 'agents', label: 'I’m building with agents', detail: 'Explore agent identities and relationship APIs.' },
  ] },
  { title: 'What would make your day easier?', options: [
    { id: 'relationships', label: 'Remember people and follow-ups', detail: 'Keep context and the next useful action together.' },
    { id: 'sales', label: 'Manage leads and customer work', detail: 'Follow a relationship from first contact to delivery.' },
    { id: 'agentic', label: 'Explore help from agents', detail: 'Try proposals, approvals, and the local simulator.' },
    { id: 'explore', label: 'I’m still figuring it out', detail: 'Let me look around before I decide.' },
  ] },
  { title: 'Where would you like your CRM to live?', options: [
    { id: 'local', label: 'On my computer', detail: 'Local or Docker. No cloud account needed.' },
    { id: 'cloudflare', label: 'In my Cloudflare account', detail: 'A guided setup with my own database and files.' },
    { id: 'vercel', label: 'In my Vercel account', detail: 'GitHub deployment with separate storage and identity setup.' },
    { id: 'tour', label: 'Show me first', detail: 'A public tour with fictional data. No installation.' },
  ] },
] as const;

export function recommendPath(answers: readonly string[]) {
  if (answers.length !== guideQuestions.length || answers.some((answer, index) =>
    !guideQuestions[index].options.some((option) => option.id === answer))) return null;
  const [audience, goal, hosting] = answers;
  const persona = publicPersonas.find((item) => item.id === audience)!;
  const preview = audience === 'enterprise' || audience === 'agents';
  const browse = hosting === 'tour' || goal === 'explore';
  const setup = hosting === 'local' ? 'docker' : hosting;
  const agentic = goal === 'agentic' ? publicPersonas.find((item) => item.id === 'agentic')! : null;
  return {
    persona, agentic,
    title: preview ? 'Start with the architecture and current boundaries.' : browse ? 'Start with a little exploring.' : 'Start with a workspace of your own.',
    reason: preview ? 'Your path includes capabilities still in development. Review what is available before planning a rollout.'
      : browse ? 'You can explore a fictional workspace before installing anything or entering your own data.'
      : hosting === 'local' ? 'You want your records on your own computer. The local and Docker guides are the simplest starting point.'
      : 'You want access through your own cloud account. The setup guide covers storage and owner sign-in as well as deployment.',
    href: preview ? `/platform#persona-${audience}` : browse ? '/tour' : `/deploy?path=${setup}`,
    action: preview ? 'Explore this path' : browse ? 'Take the product tour' : hosting === 'local' ? 'Set up on my computer' : `Set up on ${hosting === 'vercel' ? 'Vercel' : 'Cloudflare'}`,
    firstStep: preview ? 'Read the current boundaries for this profile, then compare them with your requirements before choosing a deployment.'
      : browse ? 'In the tour, follow one fictional customer through contacts, opportunities, and work.'
      : goal === 'relationships' ? 'After setup, add one contact and one follow-up. Build the habit before importing everything.'
      : goal === 'sales' ? 'After setup, add one lead, an opportunity, and the next promised action.'
      : goal === 'agentic' ? 'Explore a proposal in the local simulator and review its approval and receipt. External execution is blocked in this release.'
      : 'In the tour, follow one fictional customer through contacts, opportunities, and work.',
  };
}
