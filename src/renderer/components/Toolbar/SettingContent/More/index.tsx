import React from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { RiLink, RiWindowLine, RiGroupLine, RiTerminalBoxLine } from 'react-icons/ri';
import StandCard from '@/components/Card/StandCard';
import Guide from '@/components/Guide';
import * as Utils from '@/utils';
import styles from '../index.module.css';

interface MoreProps {}

const { shell, clipboard, dialog } = window.contextModules.electron;
const process = window.contextModules.process;

const linksGroup = Utils.Group(
  [
    {
      url: 'mailto:hello@fundpilot.app',
      name: '联系作者',
    },
    {
      url: 'https://fundpilot.app',
      name: '官方网站',
    },
    {
      url: 'https://fundpilot.app/blog',
      name: '更新日志',
    },
    {
      url: 'https://github.com/fundpilot/fund-pilot',
      name: 'Github',
    },
    {
      url: 'https://github.com/fundpilot/fund-pilot/issues/new?assignees=&labels=&template=issue_template_bug.md',
      name: 'BUG反馈',
    },
    {
      url: 'https://github.com/fundpilot/fund-pilot/issues/new?assignees=&labels=&template=issue_template_feature.md',
      name: '提出建议',
    },
  ],
  3
);

const projectGroup = Utils.Group(
  [
    {
      url: 'https://github.com/fundpilot/fund-pilot',
      name: '源码仓库',
    },
    {
      url: 'https://github.com/fundpilot/fund-pilot/releases',
      name: '版本发布',
    },
    {
      url: 'https://github.com/fundpilot/fund-pilot/blob/main/LICENSE',
      name: '开源协议',
    },
  ],
  3
);

const More: React.FC<MoreProps> = () => {
  function onCopyGroup(number: string) {
    clipboard.writeText(number);
    dialog.showMessageBox({
      title: '复制成功',
      type: 'info',
      message: `已复制到粘贴板`,
    });
  }

  function onNavigate(url: string) {
    shell.openExternal(url);
  }

  return (
    <div className={styles.content}>
      <StandCard
        icon={<RiLink />}
        title="关于 Fund Pilot"
        extra={
          <div className={styles.guide}>
            <Guide list={[{ name: '☕️', text: 'buy me a coffee :)' }]} />
          </div>
        }
      >
        <div className={clsx('card-body')}>
          <div className={clsx(styles.describe)}>
            {
              'Fund Pilot 是一款基金、大盘、股票、虚拟货币状态栏小工具，所有行情数据均来自第三方公开接口，仅供参考，不构成任何投资建议。软件完全开源免费，基于 GPLv3 协议发布。'
            }
          </div>
          {linksGroup.map((links, index) => (
            <div key={index} className={styles.link}>
              {links.map((link) => (
                <React.Fragment key={link.name}>
                  <a onClick={() => onNavigate(link.url)}>{link.name}</a>
                  <i />
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </StandCard>
      <StandCard icon={<RiGroupLine />} title="参与共建">
        <div className={clsx(styles.group, 'card-body')}>
          <section>
            <label>问题反馈：</label>
            <a onClick={() => onNavigate('https://github.com/fundpilot/fund-pilot/issues')}>GitHub Issues</a>
          </section>
          <section>
            <label>功能建议：</label>
            <a
              onClick={() =>
                onNavigate('https://github.com/fundpilot/fund-pilot/issues/new?assignees=&labels=&template=issue_template_feature.md')
              }
            >
              新建讨论
            </a>
          </section>
        </div>
      </StandCard>
      <StandCard icon={<RiWindowLine />} title="项目信息">
        <div className={clsx('card-body')}>
          {projectGroup.map((links, index) => (
            <div key={index} className={styles.link}>
              {links.map((link) => (
                <React.Fragment key={link.name}>
                  <a onClick={() => onNavigate(link.url)}>{link.name}</a>
                  <i />
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </StandCard>
      <StandCard icon={<RiTerminalBoxLine />} title="构建信息">
        <div className={clsx(styles.buildGroup, 'card-body')}>
          <section>
            <label>Electron：</label>
            <div>{process.electron}</div>
          </section>
          <section>
            <label>Node.js：</label>
            <div>{process.node}</div>
          </section>
          <section>
            <label>Chromium：</label>
            <div>{process.chrome}</div>
          </section>
          <section>
            <label>V8：</label>
            <div>{process.v8}</div>
          </section>
          <section>
            <label>OS：</label>
            <div>
              {process.platform} {process.arch}
            </div>
          </section>
          <section>
            <label>Sandboxed：</label>
            <div>{String(process.sandboxed)}</div>
          </section>
          <section>
            <label>构建日期：</label>
            <div>{dayjs(process.buildDate).format('YYYYMMDDHHmmss')}</div>
          </section>
        </div>
      </StandCard>
    </div>
  );
};

export default More;
