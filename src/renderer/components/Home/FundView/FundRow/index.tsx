import React from 'react';
import clsx from 'clsx';
import { RiEditLine, RiArrowDownSLine, RiArrowUpSLine, RiDeleteBin6Line } from 'react-icons/ri';
import Collapse from '@/components/Collapse';
import MemoNote from '@/components/MemoNote';
import { toggleFundCollapseAction } from '@/store/features/wallet';
import { useAppDispatch, useAppSelector } from '@/utils/hooks';
import * as Utils from '@/utils';
import * as Helpers from '@/helpers';
import * as Enums from '@/utils/enums';
import styles from './index.module.css';

export interface RowProps {
  fund: Fund.ResponseItem & Fund.ExtraRow & Fund.FixData;
  readOnly?: boolean;
  onEdit?: (fund: Fund.SettingItem) => void;
  onDelete?: (fund: Fund.SettingItem) => void;
  onDetail: (code: string) => void;
}

const arrowSize = {
  width: 12,
  height: 12,
};

const FundRow: React.FC<RowProps> = (props) => {
  const { fund, readOnly } = props;
  const dispatch = useAppDispatch();
  const conciseSetting = useAppSelector((state) => state.setting.systemSetting.conciseSetting);
  const fundConfigCodeMap = useAppSelector((state) => state.wallet.fundConfigCodeMap);
  const eyeStatus = useAppSelector((state) => state.wallet.eyeStatus);
  const calcFundResult = Helpers.Fund.CalcFund(fund, fundConfigCodeMap);
  const { isFix, hasTodayData } = calcFundResult;
  // 今日无数据（未开市 / 非交易日 / 数据源还没出估值）时展示 --，不再把上一交易日算成今日
  const hasToday = !!hasTodayData;
  const gszzlText = hasToday && calcFundResult.gszzl !== '' ? `${Utils.Yang(calcFundResult.gszzl)} %` : '--';
  const jrsygzText = hasToday ? `¥ ${Utils.Yang(calcFundResult.jrsygz.toFixed(2))}` : '--';

  const fundConfig = fundConfigCodeMap[fund.fundcode!];

  function onRowClick() {
    if (readOnly) {
      onDetailClick();
    } else {
      dispatch(toggleFundCollapseAction(fund));
    }
  }

  function onDetailClick() {
    props.onDetail(fund.fundcode!);
  }

  function onEditClick() {
    props.onEdit?.(fundConfig);
  }

  function onDeleteClick() {
    props.onDelete?.(fundConfig);
  }

  return (
    <>
      <div className={clsx(styles.row)} onClick={onRowClick}>
        {!readOnly && (
          <div className={styles.arrow}>
            {fund.collapse ? <RiArrowUpSLine style={{ ...arrowSize }} /> : <RiArrowDownSLine style={{ ...arrowSize }} />}
          </div>
        )}
        <div style={{ flex: 1, width: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className={styles.fundName}>{fund.name}</span>
            {!!calcFundResult.cyfe && <span className={styles.hold}>持有</span>}
            {/* 估算持有收益率 */}
            {!!calcFundResult.cbj && eyeStatus && (
              <span className={clsx(Utils.GetValueColor(calcFundResult.gscysyl).blockClass, styles.gscysyl)}>
                {calcFundResult.gscysyl === '' ? `--` : `${Utils.Yang(calcFundResult.gscysyl)}%`}
              </span>
            )}
            {isFix && <span className={styles.warn}>更新</span>}
          </div>
          {!conciseSetting && (
            <div className={styles.rowBar}>
              <div>
                <span className={styles.code}>{fund.fundcode}</span>
                <span>{isFix ? calcFundResult.fixDate : calcFundResult.gztime?.slice(5)}</span>
                {eyeStatus && (
                  <span className={clsx(Utils.GetValueColor(calcFundResult.jrsygz).textClass, styles.worth)}>
                    {hasToday ? Utils.Yang(calcFundResult.jrsygz.toFixed(2)) : '--'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {conciseSetting ? (
          <div className={clsx(styles.conciseValue, Utils.GetValueColor(calcFundResult.gszzl).textClass)}>{gszzlText}</div>
        ) : (
          <div className={clsx(styles.value, Utils.GetValueColor(calcFundResult.gszzl).blockClass)}>{gszzlText}</div>
        )}
      </div>
      <Collapse isOpened={fund.collapse}>
        <div className={styles.collapseContent}>
          <section>
            <span>净值：</span>
            <span>{calcFundResult.dwjz}</span>
            {!!calcFundResult.jzrq && <span>（{calcFundResult.jzrq}）</span>}
          </section>
          {!hasToday && (
            <section className={styles.fullRow}>
              <span>今日数据：</span>
              <span className={styles.estimateHint}>未开市 / 今日暂无估值</span>
            </section>
          )}
          {fund.estimateSource === 'sina' && (
            <section className={styles.fullRow}>
              <span>估值来源：</span>
              <span className={styles.estimateHint}>新浪财经</span>
            </section>
          )}
          <section>
            <span>成本价：</span>
            {calcFundResult.cbj !== undefined ? <span>{calcFundResult.cbj}</span> : <a onClick={onEditClick}>录入</a>}
          </section>
          <section>
            <span>持有份额：</span>
            <span>{calcFundResult.cyfe}</span>
            <RiEditLine className={styles.editor} onClick={onEditClick} />
            <RiDeleteBin6Line className={styles.editor} onClick={onDeleteClick} />
          </section>
          <section>
            <span>成本金额：</span>
            <span>{calcFundResult.cbje !== undefined ? `¥ ${calcFundResult.cbje.toFixed(2)}` : '暂无'}</span>
          </section>
          <section>
            <span>持有收益率：</span>
            <span className={clsx(Utils.GetValueColor(calcFundResult.cysyl).textClass)}>
              {calcFundResult.cysyl !== undefined ? `${Utils.Yang(calcFundResult.cysyl.toFixed(2))}%` : '暂无'}
            </span>
          </section>
          <section>
            <span>{isFix ? '今日收益：' : '估算收益：'}</span>
            <span className={clsx(Utils.GetValueColor(calcFundResult.jrsygz).textClass)}>{jrsygzText}</span>
          </section>
          <section>
            <span>持有收益：</span>
            <span className={clsx(Utils.GetValueColor(calcFundResult.cysy).textClass)}>
              {calcFundResult.cysy !== undefined ? `¥ ${Utils.Yang(calcFundResult.cysy.toFixed(2))}` : '暂无'}
            </span>
          </section>
          <section>
            <span>{isFix ? '今日总额：' : '估算总值：'}</span>
            <span>¥ {calcFundResult.gszz.toFixed(2)}</span>
          </section>
          {calcFundResult.memo && <MemoNote text={calcFundResult.memo} />}
          <div className={styles.view}>
            <a onClick={onDetailClick}>{'查看详情 >'}</a>
          </div>
        </div>
      </Collapse>
    </>
  );
};

export default FundRow;
