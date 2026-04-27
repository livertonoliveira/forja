import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { detectBundleSize } from './bundle-size.js';
import { detectLcp } from './lcp.js';
import { detectCls } from './cls.js';
import { detectInp } from './inp.js';
import { detectTti } from './tti.js';
import { detectImages } from './images.js';
import { detectFonts } from './fonts.js';
import { detectJavascript } from './javascript.js';
import { detectCss } from './css.js';
import { detectNetwork } from './network.js';
import { detectThirdPartyScripts } from './third-party-scripts.js';

export async function runGenericFrontendAudit(ctx: AuditContext): Promise<AuditFinding[]> {
  const results = await Promise.all([
    detectBundleSize(ctx),
    detectLcp(ctx),
    detectCls(ctx),
    detectInp(ctx),
    detectTti(ctx),
    detectImages(ctx),
    detectFonts(ctx),
    detectJavascript(ctx),
    detectCss(ctx),
    detectNetwork(ctx),
    detectThirdPartyScripts(ctx),
  ]);
  return results.flat();
}
