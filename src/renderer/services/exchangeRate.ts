import request from '@/utils/request';

/**
 * 汇率数据源
 *
 * 主源：open.er-api.com（exchangerate-api 免费版，每日更新，一次返回全部币种）
 * 备用：东财外汇 m:119（覆盖不全，仅作兜底）
 *
 * 统一以「1 单位基准币 = X 单位目标币」的形式返回。
 */

export type RateTable = {
  base: string;
  rates: Record<string, number>;
  updateTime: string;
  source: string;
};

/** 常用币种，带中文名与符号 */
export const COMMON_CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: 'CNY', name: '人民币', symbol: '¥' },
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'EUR', name: '欧元', symbol: '€' },
  { code: 'JPY', name: '日元', symbol: '¥' },
  { code: 'HKD', name: '港币', symbol: 'HK$' },
  { code: 'GBP', name: '英镑', symbol: '£' },
  { code: 'KRW', name: '韩元', symbol: '₩' },
  { code: 'TWD', name: '新台币', symbol: 'NT$' },
  { code: 'MOP', name: '澳门元', symbol: 'MOP$' },
  { code: 'SGD', name: '新加坡元', symbol: 'S$' },
  { code: 'AUD', name: '澳元', symbol: 'A$' },
  { code: 'CAD', name: '加元', symbol: 'C$' },
  { code: 'CHF', name: '瑞士法郎', symbol: 'CHF' },
  { code: 'NZD', name: '新西兰元', symbol: 'NZ$' },
  { code: 'THB', name: '泰铢', symbol: '฿' },
  { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM' },
  { code: 'PHP', name: '菲律宾比索', symbol: '₱' },
  { code: 'VND', name: '越南盾', symbol: '₫' },
  { code: 'IDR', name: '印尼盾', symbol: 'Rp' },
  { code: 'INR', name: '印度卢比', symbol: '₹' },
  { code: 'RUB', name: '俄罗斯卢布', symbol: '₽' },
  { code: 'AED', name: '阿联酋迪拉姆', symbol: 'د.إ' },
  { code: 'SAR', name: '沙特里亚尔', symbol: '﷼' },
  { code: 'TRY', name: '土耳其里拉', symbol: '₺' },
  { code: 'BRL', name: '巴西雷亚尔', symbol: 'R$' },
  { code: 'ZAR', name: '南非兰特', symbol: 'R' },
  { code: 'MXN', name: '墨西哥比索', symbol: 'MX$' },
  { code: 'SEK', name: '瑞典克朗', symbol: 'kr' },
  { code: 'NOK', name: '挪威克朗', symbol: 'kr' },
  { code: 'DKK', name: '丹麦克朗', symbol: 'kr' },
];

const CURRENCY_NAME_MAP: Record<string, string> = COMMON_CURRENCIES.reduce(
  (map, item) => ({ ...map, [item.code]: item.name }),
  {}
);

export function getCurrencyName(code: string) {
  return CURRENCY_NAME_MAP[code] || code;
}

export function getCurrencySymbol(code: string) {
  return COMMON_CURRENCIES.find((item) => item.code === code)?.symbol || '';
}

/** 主源：open.er-api.com，任意基准币 */
export async function GetRateTableFromErApi(base = 'CNY'): Promise<RateTable | undefined> {
  try {
    const { body } = await request<{
      result: string;
      time_last_update_utc: string;
      base_code: string;
      rates: Record<string, number>;
    }>(`https://open.er-api.com/v6/latest/${base}`, {
      responseType: 'json',
    });
    if (body?.result !== 'success' || !body.rates) {
      return;
    }
    return {
      base: body.base_code || base,
      rates: body.rates,
      updateTime: body.time_last_update_utc || '',
      source: 'open.er-api.com',
    };
  } catch (error) {
    return;
  }
}

/** 备用源：东财外汇，以 USD 为基准拼装常见币种 */
export async function GetRateTableFromEastmoney(): Promise<RateTable | undefined> {
  try {
    const { body } = await request<{
      data: { diff: Record<string, { f2: number; f12: string; f14: string }> } | null;
    }>('https://73.push2.eastmoney.com/api/qt/clist/get', {
      searchParams: {
        pn: 1,
        pz: 300,
        po: 1,
        fltt: 2,
        invt: 2,
        fid: 'f3',
        fields: 'f2,f3,f12,f14',
        fs: 'm:119',
        _: Date.now(),
      },
      responseType: 'json',
    });
    const diff = body?.data?.diff || {};
    const list = Object.values(diff);
    // 只取 XXXUSD / USDXXX 形式
    const rates: Record<string, number> = { USD: 1 };
    list.forEach((item) => {
      const pair = String(item.f12 || '');
      const price = Number(item.f2);
      if (!Number.isFinite(price) || price <= 0) {
        return;
      }
      if (pair.endsWith('USD') && pair.length === 6) {
        const code = pair.slice(0, 3);
        // 1 USD = 1 / (XXX per USD)
        rates[code] = Number((1 / price).toFixed(6));
      } else if (pair.startsWith('USD') && pair.length === 6) {
        rates[pair.slice(3)] = price;
      }
    });
    if (Object.keys(rates).length <= 1) {
      return;
    }
    return {
      base: 'USD',
      rates,
      updateTime: '',
      source: '东方财富',
    };
  } catch (error) {
    return;
  }
}

/** 取汇率表：主源优先，失败自动切备用源 */
export async function GetRateTable(base = 'CNY'): Promise<RateTable | undefined> {
  const primary = await GetRateTableFromErApi(base);
  if (primary) {
    return primary;
  }
  const backup = await GetRateTableFromEastmoney();
  if (!backup) {
    return;
  }
  // 备用源以 USD 为基准，若请求的不是 USD 需要换算
  if (base === 'USD' || !backup.rates[base]) {
    return backup;
  }
  const baseRate = backup.rates[base];
  const converted: Record<string, number> = {};
  Object.entries(backup.rates).forEach(([code, value]) => {
    converted[code] = Number((value / baseRate).toFixed(8));
  });
  return { ...backup, base, rates: converted };
}

/**
 * 换算
 * rate = 1 基准币可兑换的目标币数量
 */
export function convertAmount(amount: number, fromRate: number, toRate: number) {
  if (!Number.isFinite(amount) || !fromRate || !toRate) {
    return NaN;
  }
  return (amount / fromRate) * toRate;
}

/** 金额格式化：大额保留 2 位，小额保留 4-6 位 */
export function formatMoney(value: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const abs = Math.abs(value);
  if (abs === 0) {
    return '0.00';
  }
  if (abs >= 1000) {
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (abs >= 1) {
    return value.toFixed(2);
  }
  if (abs >= 0.01) {
    return value.toFixed(4);
  }
  return value.toFixed(6);
}
