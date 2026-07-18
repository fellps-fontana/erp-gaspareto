import { CompanyConfig, DEFAULT_MODULES } from '../../models/company-config';
import { generateMockId } from '../core/mock-id';

export const COMPANY_CONFIG_SEED: CompanyConfig[] = [
  {
    id: 'company',
    modules: { ...DEFAULT_MODULES }
  }
];
