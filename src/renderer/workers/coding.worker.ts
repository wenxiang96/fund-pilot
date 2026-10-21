import { compose } from 'redux';
import { encode, decode } from 'js-base64';
import * as Comlink from 'comlink';

function encodeFP(content: any) {
  const ffprotocol = 'fp://'; // FP 协议
  return `${ffprotocol}${encode(JSON.stringify(content))}`;
}

function decodeFP(content: string) {
  const ffprotocol = 'fp://'; // FP 协议
  try {
    const protocolLength = ffprotocol.length;
    const protocol = content.slice(0, protocolLength);
    if (protocol !== ffprotocol) {
      throw Error('协议错误');
    }
    const body = content.slice(protocolLength);
    return JSON.parse(decode(body));
  } catch (error) {
    return null;
  }
}

function encryptFP(content: string) {
  return compose(encode, encodeFP)(content);
}

function decryptFP(content: string) {
  return compose(decodeFP, decode)(content);
}

const exposes = {
  encodeFP,
  decodeFP,
  encryptFP,
  decryptFP,
};

export type ExposesType = typeof exposes;

Comlink.expose(exposes);
