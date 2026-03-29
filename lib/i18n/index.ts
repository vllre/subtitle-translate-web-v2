import en from './en';
import vi from './vi';
import id from './id';

export type Locale = 'en' | 'vi' | 'id';

export type Translations = typeof en;

export const locales: Record<Locale, Translations> = {
  en,
  vi,
  id
};

export const localeNames: Record<Locale, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia'
};

/**
 * Dịch một chuỗi với các tham số
 * @param str Chuỗi cần dịch có thể chứa {param}
 * @param params Tham số để thay thế trong chuỗi
 */
export function translateWithParams(str: string, params: Record<string, string | number> = {}): string {
  return str.replace(/{([^}]+)}/g, (_, key) => {
    const replacement = params[key];
    return replacement !== undefined ? String(replacement) : `{${key}}`;
  });
}

/**
 * Lấy giá trị từ một đường dẫn lồng nhau (vd: "common.buttons.save")
 * @param obj Đối tượng chứa dữ liệu đa ngôn ngữ
 * @param path Đường dẫn đến giá trị
 */
export function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined;
  }, obj) as string;
}

export type { Translations as I18nStrings };
export default locales; 