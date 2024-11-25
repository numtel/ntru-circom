import {strictEqual, notStrictEqual} from 'node:assert';

import NTRU from '../index.js';

describe('javascript reference implementation', () => {
  it('should encrypt and decrypt strings', () => {
    const inputStr = 'Hello World';
    const ntru = new NTRU;
    ntru.generatePrivateKeyF();
    ntru.generateNewPublicKeyGH();
    const encrypted = ntru.encryptStr(inputStr);
    strictEqual(ntru.decryptStr(encrypted), inputStr);
  });

  it('should fail to decrypt string using different private key', () => {
    const inputStr = 'Hello World';
    const ntruEnc = new NTRU;
    ntruEnc.generatePrivateKeyF();
    ntruEnc.generateNewPublicKeyGH();
    const encrypted = ntruEnc.encryptStr(inputStr);

    const ntruDec = new NTRU;
    ntruDec.generatePrivateKeyF();
    notStrictEqual(ntruDec.decryptStr(encrypted), inputStr);
  });
});
