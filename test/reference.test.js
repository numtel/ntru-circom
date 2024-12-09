import {deepStrictEqual, strictEqual, notStrictEqual} from 'node:assert';

import NTRU, {addPolynomials} from '../index.js';

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
      df: Math.floor(701/3),
      dg: Math.floor(701/3),
      dr: Math.floor(701/3),
    });
    ntru.generatePrivateKeyF();
    ntru.generateNewPublicKeyGH();
    const encrypted = ntru.encryptStr(inputStr);
    strictEqual(ntru.decryptStr(encrypted), inputStr);
  });

  // summing ciphertexts increases chances for decryption failure
  // this test may fail
  it('should exhibit additive homomorphism', () => {
    // Plaintext bits are actually trinary
    const input1 = [1,2,1,0,1];
    const input2 = [0,1,1,1,0,1,0,1];
    const sum =    [1,0,2,1,1,1,0,1];
    const ntru = new NTRU;
    ntru.generatePrivateKeyF();
    ntru.generateNewPublicKeyGH();
    const encrypted1 = ntru.encryptBits(input1).value;
    const encrypted2 = ntru.encryptBits(input2).value;
    const encryptedSum = addPolynomials(encrypted1, encrypted2, ntru.q);
    const decrypted = ntru.decryptBits(encryptedSum);
    deepStrictEqual(decrypted.value, sum);
  });

});
