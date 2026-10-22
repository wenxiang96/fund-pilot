import React, { useMemo, useState } from 'react';
import { Select, Input, Button, Spin, Empty } from 'antd';
import { useRequest } from 'ahooks';
import clsx from 'clsx';
import { RiArrowLeftRightLine, RiRefreshLine } from 'react-icons/ri';
import CustomDrawerContent from '@/components/CustomDrawer/Content';
import PureCard from '@/components/Card/PureCard';
import StandCard from '@/components/Card/StandCard';
import * as Services from '@/services/exchangeRate';
import styles from './index.module.css';

interface CalculatorProps {
  onEnter: () => void;
  onClose: () => void;
}

const CURRENCIES = Services.COMMON_CURRENCIES;
const QUICK_AMOUNTS = [100, 500, 1000, 5000, 10000];

const Calculator: React.FC<CalculatorProps> = (props) => {
  const [from, setFrom] = useState('CNY');
  const [to, setTo] = useState('USD');
  const [amount, setAmount] = useState<number | string>(1000);

  // 以 CNY 为基准拉一次汇率表，任意两种币之间用比率换算
  const { data: table, loading, refresh } = useRequest(() => Services.GetRateTable('CNY'), {
    cacheKey: 'exchange-rate-table',
    cacheTime: 1000 * 60 * 30,
    staleTime: 1000 * 60 * 5,
  });

  const rates = table?.rates || {};
  const fromRate = rates[from];
  const toRate = rates[to];

  const numericAmount = Number(amount) || 0;

  const converted = useMemo(() => {
    if (!fromRate || !toRate) {
      return NaN;
    }
    return Services.convertAmount(numericAmount, fromRate, toRate);
  }, [numericAmount, fromRate, toRate]);

  // 单位汇率：1 from = ? to
  const unitRate = fromRate && toRate ? toRate / fromRate : NaN;

  const options = CURRENCIES.map((item) => ({
    value: item.code,
    label: `${item.code} ${item.name}`,
  }));

  function onSwap() {
    setFrom(to);
    setTo(from);
  }

  return (
    <CustomDrawerContent title="汇率换算" enterText="确定" onClose={props.onClose} onEnter={props.onEnter}>
      <div className={styles.content}>
        <StandCard
          title="汇率换算"
          extra={
            <div className={styles.toolbar}>
              <RiRefreshLine onClick={refresh} />
            </div>
          }
        >
          <div className={clsx(styles.card, 'card-body')}>
            <Spin spinning={loading}>
              {/* 源货币 */}
              <div className={styles.field}>
                <label>从</label>
                <div className={styles.row}>
                  <Select
                    className={styles.select}
                    size="small"
                    showSearch
                    value={from}
                    options={options}
                    onChange={setFrom}
                    optionFilterProp="label"
                  />
                  <Input
                    className={styles.amount}
                    size="small"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="金额"
                  />
                </div>
              </div>

              <div className={styles.swapBar}>
                <Button type="text" size="small" onClick={onSwap}>
                  <RiArrowLeftRightLine style={{ height: 16, width: 16 }} />
                </Button>
              </div>

              {/* 目标货币 */}
              <div className={styles.field}>
                <label>到</label>
                <div className={styles.row}>
                  <Select
                    className={styles.select}
                    size="small"
                    showSearch
                    value={to}
                    options={options}
                    onChange={setTo}
                    optionFilterProp="label"
                  />
                  <div className={styles.result}>
                    {Number.isFinite(converted) ? (
                      <>
                        <span className={styles.resultValue}>{Services.formatMoney(converted)}</span>
                        <span className={styles.resultCode}>{to}</span>
                      </>
                    ) : (
                      '--'
                    )}
                  </div>
                </div>
              </div>

              {/* 快捷金额 */}
              <div className={styles.quick}>
                {QUICK_AMOUNTS.map((value) => (
                  <Button
                    key={value}
                    size="small"
                    type={numericAmount === value ? 'primary' : 'default'}
                    onClick={() => setAmount(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>

              {/* 单位汇率 */}
              {Number.isFinite(unitRate) && (
                <div className={styles.rateLine}>
                  1 {from} = {Services.formatMoney(unitRate)} {to}
                </div>
              )}
            </Spin>
          </div>
        </StandCard>

        {/* 对主要货币一览 */}
        <StandCard title="主要货币">
          <div className={clsx(styles.card, 'card-body')}>
            {Object.keys(rates).length ? (
              <div className={styles.list}>
                {CURRENCIES.filter((item) => item.code !== from).map((item) => {
                  const rate = rates[item.code];
                  if (!fromRate || !rate) {
                    return null;
                  }
                  const value = Services.convertAmount(numericAmount, fromRate, rate);
                  return (
                    <div
                      key={item.code}
                      className={clsx(styles.listItem, {
                        [styles.listItemActive]: item.code === to,
                      })}
                      onClick={() => setTo(item.code)}
                    >
                      <div className={styles.listName}>
                        <span className={styles.code}>{item.code}</span>
                        <span className={styles.name}>{item.name}</span>
                      </div>
                      <div className={styles.listValue}>{Services.formatMoney(value)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="汇率加载失败，点击右上角刷新" />
            )}
          </div>
        </StandCard>

        {table?.updateTime && <div className={styles.tip}>数据来源：{table.source} · 更新于 {table.updateTime}</div>}
      </div>
    </CustomDrawerContent>
  );
};

export default Calculator;
