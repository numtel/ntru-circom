import { Circomkit } from 'circomkit';

import {
  degree,
} from '../index.js';

const SNARK_FIELD_SIZE = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

const circomkit = new Circomkit({
  'verbose': false,
  'inspect': true,
  'include': ['node_modules/circomlib/circuits'],
});

describe('circom implementation', () => {
  it('should calculate the degree of a polynomial', async () => {
    const poly = [4,2,0,3];
    const ref = degree(poly);
    const circuit = await circomkit.WitnessTester('degree', {
      file: 'polynomials',
      template: 'Degree',
      dir: 'test/polynomials',
      params: [4],
    });
    await circuit.expectPass({ coeff: poly }, { out: ref });
  });

  it('should calculate the degree of a zero polynomial', async () => {
    const poly = [0,0,0,0];
    const circuit = await circomkit.WitnessTester('degree', {
      file: 'polynomials',
      template: 'Degree',
      dir: 'test/polynomials',
      params: [4],
    });
    await circuit.expectPass({ coeff: poly }, { out: SNARK_FIELD_SIZE - 1n });
  });
});
