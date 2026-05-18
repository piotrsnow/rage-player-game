import { config } from '../../config.js';
import centralEuropean from './centralEuropean.js';
import polish from './polish.js';

const STYLES = { central_european: centralEuropean, polish };

export const activeStyle = STYLES[config.namingStyle] || centralEuropean;
export { STYLES };
