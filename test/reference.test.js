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

  it('should encrypt and decrypt strings with large keys', () => {
    if(!process.env.GO_LARGE) {
      console.log('      Set GO_LARGE=1 env var to run this test case, it is big!');
      return;
    }
    const inputStr = 'Big polys';
    const ntru = new NTRU({
      N: 701,
      q: 8192,
//       df: 2500,
//       dg: 2000,
//       dr: 2000,
    });
    ntru.generatePrivateKeyF();
    ntru.generateNewPublicKeyGH();
    const encrypted = ntru.encryptStr(inputStr);
    strictEqual(ntru.decryptStr(encrypted), inputStr);
  });

});
