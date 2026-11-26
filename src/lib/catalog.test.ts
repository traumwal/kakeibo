import { describe, expect, it } from 'vitest';
import { CATALOG, planSubName, searchCatalog } from './catalog';
import { subCategoryOptions } from './categories';
import { DEFAULT_CATEGORIES } from './storage';

describe('catalog', () => {
  it('finds services by kana alias and plan name', () => {
    expect(searchCatalog('ネトフリ').map((s) => s.name)).toEqual(['Netflix']);
    expect(searchCatalog('2TB').map((s) => s.name)).toEqual(['iCloud+', 'Google One']);
    expect(searchCatalog('').length).toBe(CATALOG.flatMap((g) => g.services).length);
  });

  it('adds the plan name only when there is more than one plan', () => {
    const netflix = searchCatalog('netflix')[0];
    expect(planSubName(netflix, netflix.plans[1])).toBe('Netflix スタンダード');
    const unext = searchCatalog('u-next')[0];
    expect(planSubName(unext, unext.plans[0])).toBe('U-NEXT');
  });

  it('uses categories that the form can select', () => {
    const options = subCategoryOptions(DEFAULT_CATEGORIES);
    for (const s of CATALOG.flatMap((g) => g.services)) expect(options).toContain(s.category);
  });
});
