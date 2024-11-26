import { Circomkit } from 'circomkit';

import {
  degree,
  modInverse,
} from '../index.js';

const SNARK_FIELD_SIZE = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

const circomkit = new Circomkit({
  'verbose': false,
  'inspect': true,
  'include': ['node_modules/circomlib/circuits'],
});

describe('circom implementation', () => {

  [ [4,2,0,3], [0,0,0], [4,2,0,0] ].forEach((poly, index) => {
    it(`should calculate the degree of a polynomial #${index}`, async () => {
      const ref = degree(poly);
      const circuit = await circomkit.WitnessTester('degree', {
        file: 'polynomials',
        template: 'Degree',
        dir: 'test/polynomials',
        params: [poly.length],
      });
      await circuit.expectPass(
        { coeff: poly },
        { out: ref === -1 ? SNARK_FIELD_SIZE - 1n : ref }
      );
    });
  });

  [ 3, 128 ].forEach(p => {
    const params = [
      p,
      // p fits inside an integer of n bits:
      Math.ceil(Math.log2(p)) + 2 // + 2 just to be sure
    ];
    it(`should calculate the modulus of ${p}`, async () => {
      const circuit = await circomkit.WitnessTester('modulus3', {
        file: 'polynomials',
        template: 'Modulus',
        dir: 'test/polynomials',
        params,
      });
      for(let i = 0; i < p*3; i++) {
        await circuit.expectPass(
          { x: i },
          { y: i % p }
        );
      }
    });

    it(`should calculate the modInverse mod ${p}`, async () => {
      const circuit = await circomkit.WitnessTester('modInverse3', {
        file: 'polynomials',
        template: 'ModInverse',
        dir: 'test/polynomials',
        params,
      });
      for(let i = 0; i < p*3; i+= Math.floor(p/3)) {
        const ref = modInverse(i, p);
        await circuit.expectPass(
          { a: i },
          { out: ref === null ? 0 : ref }
        );
      }
    });
  });


});
