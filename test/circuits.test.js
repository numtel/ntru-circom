import { strictEqual, deepStrictEqual } from 'node:assert';

import { Circomkit } from 'circomkit';

import NTRU, {
  addPolynomials,
  multiplyPolynomials,
  dividePolynomials,
  expandArray,
} from '../index.js';

const circomkit = new Circomkit({
  'verbose': !!process.env.VERBOSE,
  'inspect': true,
  'include': ['node_modules'],
});

describe('circom implementation', () => {

  it('CombineArray/UnpackArray', async () => {
    const maxVal = 8192;
    const maxInputBits = Math.log2(maxVal);
    const numInputsPerOutput = Math.floor(252/maxInputBits);
    const arrLen = Math.ceil(701 / numInputsPerOutput) * numInputsPerOutput; // N=701 large key
    const maxOutputBits = numInputsPerOutput * maxInputBits;
    const outputSize = Math.ceil(arrLen / numInputsPerOutput);
    const inArr = new Array(arrLen).fill(0).map(_ => Math.floor(Math.random() * maxVal));
    const expected = inArr.reduce((out, cur, i) => {
      const outIdx = Math.floor(i/numInputsPerOutput);
      out[outIdx] += BigInt(cur) * BigInt(2 ** ((i % numInputsPerOutput) * maxInputBits));
      return out;
    }, new Array(outputSize).fill(0n));
    const circuit = await circomkit.WitnessTester(`comar`, {
      file: 'ntru',
      template: 'CombineArray',
      dir: 'test/ntru',
      params: [maxInputBits, maxOutputBits, inArr.length],
    });
    const input = { in: inArr };
    await circuit.expectPass(input, { out: expected });

    const witness = await circuit.calculateWitness(input);
    await circuit.expectConstraintPass(witness);

    const badWitness = await circuit.editWitness(witness, {
      'main.out[0]': expected[0] + 1n,
    });
    await circuit.expectConstraintFail(badWitness);

    // Also unpacks to the same input
    const circuitUnpack = await circomkit.WitnessTester(`unpackarr`, {
      file: 'ntru',
      template: 'UnpackArray',
      dir: 'test/ntru',
      params: [maxInputBits, maxOutputBits, outputSize, inArr.length],
    });
    await circuitUnpack.expectPass({in: expected}, {out: inArr});
  });

  [
    [[1,4],[0,3], 7],
    [[1,2,3],[4,3,2], 7],
    [[1,2,3,4],[5,4,3,2], 11],
    [[1,2,3,4,5],[6,5,4,3,2], 13],
    [[1,2,3,4,5,0],[7,6,5,4,3,2], 13],
  ].forEach((polys, index) => {
    it(`polynomial multiply #${index}`, async () => {
      const circuit = await circomkit.WitnessTester(`mul${index}`, {
        file: 'ntru',
        template: 'MultiplyPolynomials',
        dir: 'test/ntru',
        params: [polys[0].length],
      });
      const input = { a: polys[0], b: polys[1] };
      const result = multiplyPolynomials(input.a, input.b, Math.pow(2,20));
      await circuit.expectPass(input, { result });
      await circuit.expectConstraintCount(polys[0].length ** 2, true);
      process.env.VERBOSE && console.log((await circuit.parseConstraints()).join('\n'));
    });

    it(`polynomial modular multiply #${index}`, async () => {
      const p = polys[2];

      const circuit = await circomkit.WitnessTester(`mulmod${index}`, {
        file: 'ntru',
        template: 'MultiplyPolynomialsMod',
        dir: 'test/ntru',
        params: [
          polys[0].length,
          p,
          // largest product coefficient fits inside an integer of n bits:
          Math.ceil(Math.log2(100)),
        ],
      });
      const input = { a: polys[0], b: polys[1] };
      const result = multiplyPolynomials(input.a, input.b, p);
      await circuit.expectPass(input, { result });
      process.env.VERBOSE && console.log((await circuit.parseConstraints()).join('\n'));
    });
  });

  [ 3, 128 ].forEach(p => {
    const params = [
      p,
      // x fits inside an integer of n bits:
      Math.ceil(Math.log2(p * 3)),
    ];
    it(`should calculate the modulus of ${p}`, async () => {
      const circuit = await circomkit.WitnessTester(`modulus${p}`, {
        file: 'ntru',
        template: 'Modulus',
        dir: 'test/ntru',
        params,
      });
      for(let i = 0; i < p*3; i++) {
        await circuit.expectPass(
          { x: i },
          { y: i % p }
        );

        const witness = await circuit.calculateWitness({x:i});
        await circuit.expectConstraintPass(witness);

        const badWitness = await circuit.editWitness(witness, {
          'main.x': (i) + 1,
        });
        await circuit.expectConstraintFail(badWitness);

        const badWitness2 = await circuit.editWitness(witness, {
          'main.x': (i) - 1,
        });
        await circuit.expectConstraintFail(badWitness2);
      }
      process.env.VERBOSE && console.log((await circuit.parseConstraints()).join('\n'));
    });
  });

  [
    [[1,2], [2,3], 8],
    [[1,2], [2,3], 3],
    [[81,2,96], [48,2,31], 128],
    [[81,2,96], [48,2,31], 16],
  ].forEach((polys, index) => {
    strictEqual(polys[0].length, polys[1].length);
    const p = polys[2];

    it(`should verify the polynomial division #${index}`, async () => {
      const circuit = await circomkit.WitnessTester(`divpoly${index}`, {
        file: 'ntru',
        template: 'VerifyDividePolynomials',
        dir: 'test/ntru',
        params: [
          p,
          // largest product coefficent before modulus fits inside an integer of n bits:
          Math.ceil(Math.log2(100000)),
          polys[0].length,
          polys[1].length,
        ],
      });

      let ref;
      try {
        ref = dividePolynomials(polys[0], polys[1], p);
      } catch(error) {
        // unable to divide
        // proof should fail with invalid quotient, remainder
        await circuit.expectFail({
          a: polys[0],
          b: polys[1],
          quotient: polys[0],
          remainder: polys[1],
        });
        return;
      }

      // Test case inputs may be outside the modulus, fix them first
      const poly0Fixed = addPolynomials(polys[0], [], p);
      const poly1Fixed = addPolynomials(polys[1], [], p);
      await circuit.expectPass({
        a: expandArray(poly0Fixed, polys[0].length, 0),
        b: expandArray(poly1Fixed, polys[1].length, 0),
        quotient: expandArray(ref.quotient, polys[0].length, 0),
        remainder: expandArray(ref.remainder, polys[0].length, 0),
      });
      process.env.VERBOSE && console.log((await circuit.parseConstraints()).join('\n'));
    });
  });

  // Test encryption/decryption verification at different key sizes
  [
    {
      // very small keys, not secure, but fast
      N: 17,
      q: 32,
      df: 3,
      dg: 2,
      dr: 2,
    },
    {
      N: 701,
      q: 8192,
      df: Math.floor(701/3),
      dg: Math.floor(701/3),
      dr: Math.floor(701/3),
      confirm: () => {
        if(!process.env.GO_LARGE) {
          console.log('      Set GO_LARGE=1 env var to run this test case, it is big!');
          return false;
        }
        return true;
      }
    },
    {
      // default settings
      confirm: () => {
        if(!process.env.GO_167) {
          console.log('      Set GO_167=1 env var to run this test case');
          return false;
        }
        return true;
      }
    },
  ].forEach((profile, index) => {

    it(`should verify an encryption #${index}`, async () => {
      if(profile.confirm && !profile.confirm()) return;
      const ntru = new NTRU(profile);
      ntru.generatePrivateKeyF();
      ntru.generateNewPublicKeyGH();
      // m.length = 17 = smallest N in test case array
      const m = [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
      const encrypted = ntru.encryptBits(m);

      process.env.VERBOSE && console.time('compile');
      const circuit = await circomkit.WitnessTester(`encrypt`, {
        file: 'ntru',
        template: 'VerifyEncrypt',
        dir: 'test/ntru',
        params: encrypted.params,
      });
      process.env.VERBOSE && console.timeEnd('compile');

      process.env.VERBOSE && console.time('expectPass');
      await circuit.expectPass(encrypted.inputs);
      process.env.VERBOSE && console.timeEnd('expectPass');
    });

    it(`should verify a decryption #${index}`, async () => {
      if(profile.confirm && !profile.confirm()) return;
      const ntru = new NTRU(profile);
      ntru.generatePrivateKeyF();
      ntru.generateNewPublicKeyGH();
      const m = [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
      const encrypted = ntru.encryptBits(m);
      const decrypted = ntru.decryptBits(encrypted.value);

      process.env.VERBOSE && console.time('compile');
      const circuit = await circomkit.WitnessTester(`decrypt`, {
        file: 'ntru',
        template: 'VerifyDecrypt',
        dir: 'test/ntru',
        params: decrypted.params,
      });
      process.env.VERBOSE && console.timeEnd('compile');

      process.env.VERBOSE && console.time('expectPass');
      await circuit.expectPass(decrypted.inputs);
      process.env.VERBOSE && console.timeEnd('expectPass');
      const input2 = {
        ...decrypted.inputs,
        // modify the remainder very slightly
        remainder2: decrypted.inputs.remainder2.map((x, i) => i === 0 ? x + 1 : x),
      };
      await circuit.expectFail(input2);
    });

    ['fq', 'fp', 'h'].forEach(caseName => {
      it(`should verify ${caseName} #${index}`, async () => {
        if(profile.confirm && !profile.confirm()) return;
        const ntru = new NTRU(profile);
        ntru.generatePrivateKeyF();
        ntru.generateNewPublicKeyGH();
        const thisCase = ntru.verifyKeysInputs()[caseName];

        process.env.VERBOSE && console.time('compile');
        const circuit = await circomkit.WitnessTester(`together`, {
          file: 'ntru',
          template: 'VerifyInverse',
          dir: 'test/ntru',
          params: thisCase.params,
        });
        process.env.VERBOSE && console.timeEnd('compile');

        process.env.VERBOSE && console.time('expectPass');
        await circuit.expectPass(thisCase.inputs);
        process.env.VERBOSE && console.timeEnd('expectPass');
      });
    });
  });
});
