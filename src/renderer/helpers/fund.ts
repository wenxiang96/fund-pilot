import NP from 'number-precision';
import dayjs from 'dayjs';
import { defaultWallet } from '@/store/features/wallet';
import * as Services from '@/services';
import * as Enums from '@/utils/enums';
import * as Utils from '@/utils';
import * as Adapter from '@/utils/adpters';

export function GetFundConfig(walletCode: string, walletsConfig: Wallet.SettingItem[]) {
  const walletConfig = walletsConfig.find(({ code }) => code === walletCode) || defaultWallet;
  const fundConfig = walletConfig.funds || [];
  const codeMap = Utils.GetCodeMap(fundConfig, 'code');
  return { fundConfig, codeMap };
}

/**
 * 今日是否已有净值/估值（未开市、非交易日、数据源未更新时为 false）
 * 只依赖行情字段，与持仓配置无关。
 */
export function HasTodayData(fund: Fund.ResponseItem & Fund.FixData) {
  const today = dayjs().format('MM-DD');
  if (fund.fixDate && fund.fixDate === today) {
    return true;
  }
  return (
    isEstimateToday(fund) &&
    Utils.NotEmpty(fund.gsz) &&
    fund.gsz !== '' &&
    Number.isFinite(Number(fund.gsz))
  );
}

/**
 * 估值时间是否是今天。
 * 未开市/非交易日时数据源返回的仍是上一交易日收盘的估值，不能算作当日盈亏。
 */
export function isEstimateToday(fund: Fund.ResponseItem) {
  const raw = (fund.gztime || '').trim();
  if (!raw) {
    return false;
  }
  // 数据源用 "2026-暂无估值" 这类占位值
  if (!/\d{2}:\d{2}/.test(raw)) {
    return false;
  }
  const matched = raw.match(/(\d{4}-)?(\d{1,2})-(\d{1,2})/);
  if (!matched) {
    return false;
  }
  const date = `${matched[2].padStart(2, '0')}-${matched[3].padStart(2, '0')}`;
  if (date !== dayjs().format('MM-DD')) {
    return false;
  }
  // 时间点不能晚于当前时间（容忍 5 分钟误差）
  const time = raw.match(/(\d{1,2}):(\d{2})\s*$/);
  if (time) {
    const now = dayjs();
    const minutes = Number(time[1]) * 60 + Number(time[2]);
    if (minutes > now.hour() * 60 + now.minute() + 5) {
      return false;
    }
  }
  return true;
}

export function GetFundConfigMaps(codes: string[], walletsConfig: Wallet.SettingItem[]) {
  return codes.map((code) => GetFundConfig(code, walletsConfig).codeMap);
}

export async function GetFixFunds(funds: (Fund.ResponseItem & Fund.FixData)[]) {
  const collectors = funds
    .filter(({ fixDate, gztime }) => !fixDate || fixDate !== gztime?.slice(5, 10))
    .map(
      ({ fundcode }) =>
        () =>
          Services.Fund.GetFixFromEastMoney(fundcode!)
    );
  const list = await Adapter.ChokeGroupAdapter(collectors, 3, 500);
  return list.filter(Utils.NotEmpty);
}

export async function GetFunds(config: Fund.SettingItem[], fundApiTypeSetting: Enums.FundApiType) {
  // 天天基金新版批量估值接口：一次请求拿全部分组的实时估值，避免逐只请求
  if ((fundApiTypeSetting === Enums.FundApiType.Eastmoney || fundApiTypeSetting === Enums.FundApiType.Sina) && config.length) {
    const codes = config.map(({ code }) => code).filter(Boolean);
    const valuations = await Services.Fund.GetValuationsFromEastmoney(codes);
    if (valuations.length) {
      const valuationMap = Utils.GetCodeMap(valuations, 'fundcode');
      const resolved = config.map(({ code }) => valuationMap[code]).filter(Utils.NotEmpty);

      // 数据源未提供盘中估值时，仅降级到新浪估值（不使用重仓股推算）
      const missingEstimate = resolved.filter((fund) => !fund.gszzl);
      if (missingEstimate.length) {
        const sinaList = await Adapter.ChokeGroupAdapter(
          missingEstimate.map((fund) => () => Services.Fund.GetEstimateFromSina(fund.fundcode!, 2)),
          3,
          300
        );
        missingEstimate.forEach((fund, index) => {
          const result = sinaList[index];
          if (result) {
            fund.gsz = result.gsz;
            fund.gszzl = result.gszzl;
            fund.gztime = result.gztime || dayjs().format('YYYY-MM-DD HH:mm');
            fund.estimateSource = 'sina';
          }
        });
      }

      // 估值日期/时间必须是今天的，否则说明数据源还是上一交易日的收盘估值，
      // 一律清掉，交给 CalcFund 当作「今日无数据」处理
      resolved.forEach((fund) => {
        if (!isEstimateToday(fund)) {
          fund.gszzl = '';
          fund.gztime = '';
          fund.estimateSource = undefined;
        }
      });

      // 批量接口完全没返回的基金再逐只兜底
      const missing = config.filter(({ code }) => !valuationMap[code]).map(({ code }) => code);
      if (missing.length) {
        const fallback = await Adapter.ChokeGroupAdapter(
          missing.map((code) => () => GetFund(code, fundApiTypeSetting)),
          3,
          300
        );
        return [...resolved, ...fallback.filter(Utils.NotEmpty)];
      }
      return resolved;
    }
  }

  const collectors = config.map(
    ({ code }) =>
      () =>
        GetFund(code, fundApiTypeSetting)
  );
  const load = () => {
    switch (fundApiTypeSetting) {
      case Enums.FundApiType.Tencent:
        return Adapter.ChokeGroupAdapter(collectors, 3, 300);
      case Enums.FundApiType.Ant:
        return Adapter.ChokeGroupAdapter(collectors, 4, 400);
      case Enums.FundApiType.Fund10jqka:
        return Adapter.ChokeGroupAdapter(collectors, 5, 500);
      case Enums.FundApiType.Eastmoney:
      default:
        return Adapter.ChokeGroupAdapter(collectors, 5, 500);
    }
  };
  const list = await load();

  return list.filter(Utils.NotEmpty);
}

export async function GetFund(code: string, fundApiTypeSetting: Enums.FundApiType) {
  switch (fundApiTypeSetting) {
    case Enums.FundApiType.Tencent:
      return Services.Fund.FromTencent(code);
    case Enums.FundApiType.Ant:
      return Services.Fund.FromFund123(code);
    case Enums.FundApiType.Fund10jqka:
      return Services.Fund.FromFund10jqka(code);
    case Enums.FundApiType.Sina:
      return GetFundFromSina(code);
    case Enums.FundApiType.Eastmoney:
    default:
      // 默认请求天天基金
      return Services.Fund.FromEastmoney(code);
  }
}

/**
 * 新浪估值 + 天天基金基础信息（名称/净值）组合成完整基金数据
 */
async function GetFundFromSina(code: string) {
  const [estimate, fix] = await Promise.all([
    Services.Fund.GetEstimateFromSina(code, 2),
    Services.Fund.GetFixFromEastMoney(code),
  ]);
  if (!estimate && !fix) {
    return;
  }
  const dwjz = fix?.fixDwjz || '';
  return {
    fundcode: code,
    name: fix?.fixName || '',
    dwjz,
    jzrq: fix?.fixDate || '',
    gsz: estimate?.gsz || dwjz,
    gszzl: estimate?.gszzl || '',
    gztime: estimate?.gztime || '',
    estimateSource: estimate ? ('sina' as const) : undefined,
  } as Fund.ResponseItem;
}

export function CalcFund(fund: Fund.ResponseItem & Fund.FixData, codeMap: Fund.CodeMap) {
  const config = codeMap[fund.fundcode!];
  const cyfe = config?.cyfe || 0;
  const cbj = config?.cbj;
  const memo = config?.memo;

  // 统一成 MM-DD 再比较，避免 2026-10-20 / 10-20 两种写法
  const toMMDD = (raw?: string) => {
    const value = (raw || '').trim();
    if (!value) {
      return '';
    }
    const full = value.match(/(?:\d{4}-)?(\d{1,2})-(\d{1,2})/);
    return full ? `${full[1].padStart(2, '0')}-${full[2].padStart(2, '0')}` : '';
  };

  const today = dayjs().format('MM-DD');
  const gzrq = toMMDD(fund.gztime); // 估值所属日期
  const jzrq = toMMDD(fund.jzrq); // 最近公布净值日期

  // 只有「今天的」净值/估值才参与当日盈亏计算，否则未开市/非交易日会
  // 把上一交易日的数据算成今日盈亏（刷新后未开市也显示当日盈亏的根因）
  const isFix = !!fund.fixDate && fund.fixDate === today;
  const hasEstimate =
    !isFix &&
    isEstimateToday(fund) &&
    Utils.NotEmpty(fund.gsz) &&
    fund.gsz !== '' &&
    Number.isFinite(Number(fund.gsz));
  const hasTodayData = isFix || hasEstimate;

  // 最新净值（用于持有金额、持有收益）
  const dwjz = isFix ? fund.fixDwjz! : fund.dwjz!;
  // 今日盈亏的比较基准：上一交易日净值
  const prevDwjz = (() => {
    if (!isFix) {
      return fund.dwjz!;
    }
    // 今日净值已公布：数据源的 dwjz 可能已经是今日净值，用今日涨幅反推昨日净值
    const zzl = Number(fund.fixZzl);
    const navIsToday = jzrq === today || (fund.dwjz && Number(fund.dwjz) === Number(fund.fixDwjz));
    if (navIsToday && Number.isFinite(zzl) && zzl !== 0) {
      return NP.divide(fund.fixDwjz!, NP.plus(1, NP.divide(zzl, 100)));
    }
    return fund.dwjz || fund.fixDwjz!;
  })();

  // 估算值（今日）：已公布净值 -> 今日净值；有盘中估值 -> 估值；否则 -> 最新净值
  const gsz = isFix ? fund.fixDwjz! : hasEstimate ? fund.gsz! : dwjz;
  const bjz = hasTodayData ? NP.minus(gsz!, prevDwjz) || 0 : 0;
  const jrsygz = hasTodayData ? NP.times(cyfe, bjz) : 0;
  const gszz = NP.times(gsz!, cyfe);
  const cyje = NP.times(dwjz!, cyfe);
  const cbje = cbj && NP.times(cbj, cyfe);
  const cysyl = cbj && NP.divide(NP.minus(dwjz, cbj), cbj, 0.01);
  const cysy = cbj && NP.times(NP.minus(dwjz, cbj), cyfe);
  // 估算收益率：无当日数据时留空，避免 UI 显示上一交易日的涨跌
  const gszzl = isFix ? fund.fixZzl : hasEstimate ? fund.gszzl : '';
  const gscysyl = cbj && cbj > 0 ? (isFix ? cysyl?.toFixed(2) : hasEstimate ? (Number(cysyl) + Number(gszzl)).toFixed(2) : '') : '';
  // cyfe: number; // 持有份额
  // bjz: number; // 比较值
  // jrsygz: number; // 今日收益估值
  // gszz: number; // 估算总值

  return {
    ...fund,
    cyfe, // 持有份额
    cbj, // 成本价
    memo, // 备注
    cbje, // 成本金额
    cyje, // 持有金额
    cysyl, // 持有收益率
    cysy, // 持有收益
    bjz, // 比较值
    jrsygz, // 今日收益估值
    gszz, // 估算
    isFix, // 今日净值是否已公布
    hasEstimate, // 今日是否有盘中估值
    hasTodayData, // 今日是否有数据（净值或估值）
    gsz, // 估算值（最新）
    dwjz, // 单位净值（最新）
    prevDwjz, // 上一交易日净值（今日盈亏基准）
    gszzl, // 估算收益率
    gscysyl, // 估算持有收益率
    jzrq: isFix ? fund.fixDate : jzrq, // 净值日期
  };
}

export function CalcFunds(funds: Fund.ResponseItem[] = [], codeMap: Fund.CodeMap) {
  const [zje, gszje, sygz, cysy, cbje, todayCount] = funds.reduce(
    ([a, b, c, d, e, f], fund) => {
      const calcFundResult = CalcFund(fund, codeMap);
      const { jrsygz, gszz, cyje, cysy, cbje, hasTodayData } = calcFundResult;
      return [a + cyje, b + gszz, c + (jrsygz || 0), d + (cysy || 0), e + (cbje || 0), f + (hasTodayData ? 1 : 0)];
    },
    [0, 0, 0, 0, 0, 0]
  );
  const gssyl = zje ? NP.times(NP.divide(sygz, zje), 100) : 0;
  const cysyl = cbje ? NP.times(NP.divide(cysy, cbje), 100) : 0;
  // hasTodayData: 今日是否有任何基金拿到了净值/估值，没有时不应展示「今日收益」
  return { zje, gszje, sygz, gssyl, cysy, cysyl, hasTodayData: todayCount > 0 };
}

export function CalcWalletsFund(fund: Fund.ResponseItem & Fund.FixData, codeMaps: Fund.CodeMap[]) {
  const { cyfe, jrsygz, cyje, cysy, cbje } = codeMaps.reduce(
    (r, codeMap) => {
      const calcFundResult = CalcFund(fund, codeMap);
      r.cyfe += calcFundResult.cyfe;
      r.jrsygz += calcFundResult.jrsygz;
      r.cyje += calcFundResult.cyje;
      r.cysy += calcFundResult.cysy || 0;
      r.cbje += calcFundResult.cbje || 0;
      return r;
    },
    { cyfe: 0, jrsygz: 0, cyje: 0, cysy: 0, cbje: 0 }
  );
  const cysyl = cbje ? NP.times(NP.divide(cysy, cbje), 100) : 0;
  return { cyfe, jrsygz, cyje, cysy, cbje, cysyl };
}

export function MergeFixFunds(funds: (Fund.ResponseItem & Fund.FixData)[], fixFunds: Fund.FixData[]) {
  const cloneFunds = Utils.DeepCopy(funds);
  const fixFundMap = Utils.GetCodeMap(fixFunds, 'code');

  cloneFunds.forEach((fund) => {
    const fixFund = fixFundMap[fund.fundcode!];
    if (fixFund) {
      fund.fixZzl = fixFund.fixZzl;
      fund.fixDate = fixFund.fixDate;
      fund.fixDwjz = fixFund.fixDwjz;
    }
  });
  return cloneFunds;
}

export function SortFund({
  codeMap,
  list,
  orderType,
  sortType,
}: {
  list: (Fund.ResponseItem & Fund.FixData & Fund.ExtraRow)[];
  sortType: Enums.FundSortType;
  codeMap: Fund.CodeMap;
  orderType: Enums.SortOrderType;
}) {
  const sortList = list.slice();
  sortList.sort((a, b) => {
    const calcA = CalcFund(a, codeMap);
    const calcB = CalcFund(b, codeMap);
    const t = orderType === Enums.SortOrderType.Asc ? 1 : -1;
    switch (sortType) {
      case Enums.FundSortType.Growth:
        return (Number(calcA.gszzl) - Number(calcB.gszzl)) * t;
      case Enums.FundSortType.Cost:
        return (Number(calcA.cbje || 0) - Number(calcB.cbje || 0)) * t;
      case Enums.FundSortType.Money:
        return (Number(calcA.jrsygz) - Number(calcB.jrsygz)) * t;
      case Enums.FundSortType.Estimate:
        return (Number(calcA.gszz) - Number(calcB.gszz)) * t;
      case Enums.FundSortType.Income:
        return (Number(calcA.cysy || 0) - Number(calcB.cysy || 0)) * t;
      case Enums.FundSortType.IncomeRate:
        return (Number(calcA.cysyl || 0) - Number(calcB.cysyl || 0)) * t;
      case Enums.FundSortType.Name:
        return calcA.name!.localeCompare(calcB.name!, 'zh') * t;
      case Enums.FundSortType.Custom:
      default:
        return (codeMap[b.fundcode!]?.originSort - codeMap[a.fundcode!]?.originSort) * t;
    }
  });
  return sortList;
}
