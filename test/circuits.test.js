import { strictEqual, deepStrictEqual } from 'node:assert';

import { Circomkit } from 'circomkit';

import NTRU, {
  addPolynomials,
  multiplyPolynomials,
  dividePolynomials,
  generateCustomArray,
  encrypt,
  decrypt,
} from '../index.js';

const SNARK_FIELD_SIZE = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

const circomkit = new Circomkit({
  'verbose': !!process.env.VERBOSE,
  'inspect': true,
  'include': ['node_modules'],
});

describe('circom implementation', () => {

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
          Math.ceil(Math.log2(100)) + 2, // + 2 just to be sure
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
      // p fits inside an integer of n bits:
      Math.ceil(Math.log2(p)) + 2 // + 2 just to be sure
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
    const params = [
      p,
      // largest product coefficent before modulus fits inside an integer of n bits:
      Math.ceil(Math.log2(100000)) + 2, // + 2 just to be sure
    ];

    it(`should calculate the polynomial multiplication #${index}`, async () => {
      const circuit = await circomkit.WitnessTester(`mulpoly${index}`, {
        file: 'ntru',
        template: 'MultiplyPolynomialsMod',
        dir: 'test/ntru',
        params: [
          polys[0].length,
          ...params,
        ],
      });
      const ref = multiplyPolynomials(polys[0], polys[1], p);
      await circuit.expectPass(
        { a: polys[0], b: polys[1] },
        { result: ref }
      );
      process.env.VERBOSE && console.log((await circuit.parseConstraints()).join('\n'));
    });

    it(`should verify the polynomial division #${index}`, async () => {
      const circuit = await circomkit.WitnessTester(`divpoly${index}`, {
        file: 'ntru',
        template: 'VerifyDividePolynomials',
        dir: 'test/ntru',
        params: [
          ...params,
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
      // Transform negative values since the circuit doesn't handle them
      const r = generateCustomArray(ntru.N, ntru.dr, ntru.dr).map(x=>x=== -1 ? 2 : x);
      // m.length = 17 = smallest N in test case array
      const m = [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
      const e = encrypt(r, m, ntru.h, ntru.q, ntru.I);

      // Perform encryption step-by-step to build input signals
      const rhq =  multiplyPolynomials(r, ntru.h, ntru.q);
      const rhqm = addPolynomials(m, rhq, ntru.q);
      const {quotient, remainder} = dividePolynomials(rhqm, ntru.I, ntru.q);
      // Ensure steps returned the same encrypted value as the library function
      deepStrictEqual(e, remainder);

      const circuit = await circomkit.WitnessTester(`encrypt`, {
        file: 'ntru',
        template: 'VerifyEncrypt',
        dir: 'test/ntru',
        params: [
          ntru.q,
          Math.ceil(Math.log2(10000)) + 2, // + 2 just to be sure
          ntru.N,
        ],
      });
      const input = {
        r,
        m: expandArray(m, ntru.N, 0),
        h: expandArray(ntru.h, ntru.N, 0),
        // Transform values to be within the field
        quotient: expandArray(quotient.map(x=>x%ntru.q), ntru.N+1, 0),
        remainder: expandArray(remainder, ntru.N+1, 0),
      };
      await circuit.expectPass(input);
    });

    it(`should verify a decryption #${index}`, async () => {
      if(profile.confirm && !profile.confirm()) return;
      const ntru = new NTRU(profile);
      ntru.generatePrivateKeyF();
      ntru.generateNewPublicKeyGH();
      // Transform negative values since the circuit doesn't handle them
      const r = generateCustomArray(ntru.N, ntru.dr, ntru.dr).map(x=>x=== -1 ? 2 : x);
      const m = [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
      const e = encrypt(r, m, ntru.h, ntru.q, ntru.I);
      const f = ntru.f.map(x=>x=== -1 ? ntru.q-1 : x);

      const d = decrypt(f, e, ntru.I, ntru.q, ntru.p, ntru.fp);
      deepStrictEqual(d, m);

      // Perform decryption step-by-step to build input signals
      const a = multiplyPolynomials(f, e, ntru.q);
      const aDiv = dividePolynomials(a, ntru.I, ntru.q);
      const b = aDiv.remainder.map(x => x > ntru.q/2 ? (x+1)%ntru.p : x%ntru.p);
      const c = multiplyPolynomials(ntru.fp, b, ntru.p, true);
      const cDiv = dividePolynomials(c, ntru.I, ntru.p);
      // Ensure steps returned the same decrypted value as the library function
      deepStrictEqual(d.map(x=>x=== -1 ? 2 : x), cDiv.remainder);

      const circuit = await circomkit.WitnessTester(`decrypt`, {
        file: 'ntru',
        template: 'VerifyDecrypt',
        dir: 'test/ntru',
        params: [
          ntru.q,
          Math.ceil(Math.log2(10000)) + 2, // + 2 just to be sure
          ntru.p,
          Math.ceil(Math.log2(10000)) + 2, // + 2 just to be sure
          ntru.N,
        ],
      });
      const input = {
        f: expandArray(f, ntru.N, 0),
        fp: expandArray(ntru.fp, ntru.N, 0),
        e: expandArray(e, ntru.N, 0),
        // Transform values to be within the field
        quotient1: expandArray(aDiv.quotient, ntru.N + 1, 0),
        remainder1: expandArray(aDiv.remainder, ntru.N + 1, 0),
        quotient2: expandArray(cDiv.quotient, ntru.N + 1, 0),
        remainder2: expandArray(cDiv.remainder, ntru.N + 1, 0),
      };
      await circuit.expectPass(input);
      const input2 = {
        ...input,
        remainder2: expandArray(cDiv.remainder, ntru.N + 1, 0)
          // modify the remainder very slightly
          .map((x, i) => i === 0 ? x + 1 : x),
      };
      await circuit.expectFail(input2);
    });

    it(`should verify encrypt/decrypt together #${index}`, async () => {
      if(profile.confirm && !profile.confirm()) return;
      const ntru = new NTRU(profile);
      ntru.generatePrivateKeyF();
      ntru.generateNewPublicKeyGH();
      // Transform negative values since the circuit doesn't handle them
      const r = generateCustomArray(ntru.N, ntru.dr, ntru.dr).map(x=>x=== -1 ? 2 : x);
      const m = [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
      const e = encrypt(r, m, ntru.h, ntru.q, ntru.I);
      const f = ntru.f.map(x=>x=== -1 ? ntru.q-1 : x);
      //
      // Perform encryption step-by-step to build input signals
      const rhq =  multiplyPolynomials(r, ntru.h, ntru.q);
      const rhqm = addPolynomials(m, rhq, ntru.q);
      const {quotient, remainder} = dividePolynomials(rhqm, ntru.I, ntru.q);
      // Ensure steps returned the same encrypted value as the library function
      deepStrictEqual(e, remainder);

      const d = decrypt(f, e, ntru.I, ntru.q, ntru.p, ntru.fp);
      deepStrictEqual(d, m);

      // Perform decryption step-by-step to build input signals
      const a = multiplyPolynomials(f, e, ntru.q);
      const aDiv = dividePolynomials(a, ntru.I, ntru.q);
      const b = aDiv.remainder.map(x => x > ntru.q/2 ? (x+1)%ntru.p : x%ntru.p);
      const c = multiplyPolynomials(ntru.fp, b, ntru.p, true);
      const cDiv = dividePolynomials(c, ntru.I, ntru.p);
      // Ensure steps returned the same decrypted value as the library function
      deepStrictEqual(d.map(x=>x=== -1 ? 2 : x), cDiv.remainder);

      const circuit = await circomkit.WitnessTester(`together`, {
        file: 'ntru',
        template: 'VerifyEncryptAndDecrypt',
        dir: 'test/ntru',
        params: [
          ntru.q,
          Math.ceil(Math.log2(10000)) + 2, // + 2 just to be sure
          ntru.p,
          Math.ceil(Math.log2(10000)) + 2, // + 2 just to be sure
          ntru.N,
        ],
      });
      const input = {
        // Encryption signals
        r,
        m: expandArray(m, ntru.N, 0),
        h: expandArray(ntru.h, ntru.N, 0),
        // Transform values to be within the field
        quotientE: expandArray(quotient.map(x=>x%ntru.q), ntru.N+1, 0),
        remainderE: expandArray(remainder, ntru.N+1, 0),
        // Decryption signals

        f: expandArray(f, ntru.N, 0),
        fp: expandArray(ntru.fp, ntru.N, 0),
        // Transform values to be within the field
        quotient1: expandArray(aDiv.quotient, ntru.N + 1, 0),
        remainder1: expandArray(aDiv.remainder, ntru.N + 1, 0),
        quotient2: expandArray(cDiv.quotient, ntru.N + 1, 0),
      };
      await circuit.expectPass(input);
      const input2 = {
        ...input,
        quotient2: expandArray(cDiv.quotient, ntru.N + 1, 0)
          // modify the quotient very slightly
          .map((x, i) => i === 0 ? x + 1 : x),
      };
      await circuit.expectFail(input2);
    });
  });
});

function expandArray(arr, len, fill) {
  return [...arr, ...Array(len - arr.length).fill(fill)];
}
