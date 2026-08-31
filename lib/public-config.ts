const canonicalRepositoryUrl = 'https://github.com/mlmrx/FreeCRM';

export function resolveRepositoryUrl(value?: string) {
  if (!value) return canonicalRepositoryUrl;
  try {
    const candidate = new URL(value);
    const parts = candidate.pathname.split('/').filter(Boolean);
    const validPart = /^[A-Za-z0-9_.-]+$/;
    if (
      candidate.protocol !== 'https:'
      || candidate.hostname.toLowerCase() !== 'github.com'
      || candidate.username
      || candidate.password
      || candidate.port
      || candidate.search
      || candidate.hash
      || parts.length !== 2
      || !parts.every((part) => validPart.test(part))
    ) return canonicalRepositoryUrl;

    const repository = parts[1].replace(/\.git$/i, '');
    if (!repository || !validPart.test(repository)) return canonicalRepositoryUrl;
    return `https://github.com/${parts[0]}/${repository}`;
  } catch {
    return canonicalRepositoryUrl;
  }
}

export const freeCrmRepositoryUrl = resolveRepositoryUrl(process.env.NEXT_PUBLIC_FREE_CRM_REPOSITORY_URL);
export const freeCrmCloneUrl = `${freeCrmRepositoryUrl}.git`;
export const freeCrmDeployUrl = `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(freeCrmRepositoryUrl)}`;
