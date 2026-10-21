import React from 'react';

export interface CollectProps {
  title: string;
}

/**
 * 占位组件：上游版本会在此加载远程统计页面，复刻版不再上报任何数据。
 */
export const Collect: React.FC<CollectProps> = () => null;

export default Collect;
