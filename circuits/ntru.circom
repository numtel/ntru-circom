pragma circom 2.1.0;

include "circomlib/circuits/comparators.circom";

// From https://pps-lab.com/blog/fhe_arithmetization/
template Modulus(p, n) {
  signal input x;
  signal q;
  signal output y;

  y <-- x % p;
  q <-- x \ p;
  x === q * p + y;

//   component ltP = LessThan(n);
//   ltP.in[0] <== p;
//   ltP.in[1] <== y;
//   ltP.out === 0;

  component ltQ = LessThan(n);
  ltQ.in[0] <== x;
  ltQ.in[1] <== q;
  ltQ.out === 0;
}

/*
From: https://github.com/yi-sun/circom-pairing/blob/master/circuits/bigint.circom#L227
Polynomial Multiplication
Inputs:
    - a = a[0] + a[1] * X + ... + a[k-1] * X^{k-1}
    - b = b[0] + b[1] * X + ... + b[k-1] * X^{k-1}
Output:
    - out = out[0] + out[1] * X + ... + out[2 * k - 2] * X^{2*k - 2}
    - out = a * b as polynomials in X
Notes:
    - Optimization due to xJsnark:
    -- witness is calculated by normal polynomial multiplication
    -- out is contrained by evaluating out(X) === a(X) * b(X) at X = 0, ..., 2*k - 2
    - If a[i], b[j] have absolute value < B, then out[i] has absolute value < k * B^2
*/
template MultiplyPolynomials(k) {
   var k2 = 2 * k - 1;
   signal input a[k];
   signal input b[k];
   signal output result[k2];

   var prod_val[k2];
   for (var i = 0; i < k2; i++) {
       prod_val[i] = 0;
       if (i < k) {
           for (var a_idx = 0; a_idx <= i; a_idx++) {
               prod_val[i] = prod_val[i] + a[a_idx] * b[i - a_idx];
           }
       } else {
           for (var a_idx = i - k + 1; a_idx < k; a_idx++) {
               prod_val[i] = prod_val[i] + a[a_idx] * b[i - a_idx];
           }
       }
       result[i] <-- prod_val[i];
   }

   var pow[k2][k2]; // we cache the exponent values because it makes a big difference in witness generation time
   for(var i = 0; i<k2; i++)for(var j=0; j<k2; j++)
       pow[i][j] = i ** j;

   var a_poly[k2];
   var b_poly[k2];
   var out_poly[k2];
   for (var i = 0; i < k2; i++) {
       out_poly[i] = 0;
       a_poly[i] = 0;
       b_poly[i] = 0;
       for (var j = 0; j < k2; j++) {
           out_poly[i] = out_poly[i] + result[j] * pow[i][j];
       }
       for (var j = 0; j < k; j++) {
           a_poly[i] = a_poly[i] + a[j] * pow[i][j];
           b_poly[i] = b_poly[i] + b[j] * pow[i][j];
       }
   }
   for (var i = 0; i < k2; i++) {
      out_poly[i] === a_poly[i] * b_poly[i];
   }
}


template PolyMod(n, p, np) {
  signal input in[n];
  signal output out[n];

  component modulus[n];
  for(var i = 0; i < n; i++) {
    modulus[i] = Modulus(p, np);
    modulus[i].x <== in[i];
    out[i] <== modulus[i].y;
  }
}

template MultiplyPolynomialsMod(n, p, np) {
  var newSize = n + n - 1;
  signal input a[n];
  signal input b[n];

  signal output result[newSize];

  component product = MultiplyPolynomials(n);
  product.a <== a;
  product.b <== b;

  component modulus = PolyMod(newSize, p, np);
  modulus.in <== product.result;
  result <== modulus.out;
}

template Sum(n) {
  signal input in[n];
  signal output out;

  if (n == 1) {
    out <== in[0];
  } else {
    signal partialSums[n];

    partialSums[0] <== in[0];

    for (var i = 1; i < n; i++) {
      partialSums[i] <== partialSums[i - 1] + in[i];
    }

    out <== partialSums[n - 1];
  }
}

// Instead of doing all the work of calculating the division of the polynomials,
// just verify the calculation using multiplication
template VerifyDividePolynomials(p, np, Na, Nb) {
  signal input a[Na]; // dividend
  signal input b[Nb]; // divisor
  signal input quotient[Nb];
  signal input remainder[Nb];

  var newSize = Nb + Nb - 1;
  var product[newSize] = MultiplyPolynomials(Nb)(b, quotient);
  for(var i = 0; i<Nb; i++) {
    product[i] = Modulus(p, np)(product[i] + remainder[i]);
  }
  for(var i = Nb; i<newSize; i++) {
    product[i] = Modulus(p, np)(product[i]);
  }

  // product + remainder = dividend
  component eq[Na];
  for(var i = 0; i<Na; i++) {
    eq[i] = IsEqual();
    eq[i].in[0] <== a[i];
    eq[i].in[1] <== product[i];
    eq[i].out === 1;
  }

  // Any trailing coefficients of the product are zero
  component isz[newSize - Na];
  for(var i = Na; i<newSize; i++) {
    isz[i-Na] = IsZero();
    isz[i-Na].in <== product[i];
    isz[i-Na].out === 1;
  }
}

template VerifyEncrypt(q, nq, N) {
  signal input r[N];
  signal input m[N];
  signal input h[N];
  var newSize = N + N - 1;
  signal input quotient[N+1];
  signal input remainder[N+1];

  var rhq[newSize] = MultiplyPolynomials(N)(r, h);
  for(var i = 0; i<N; i++) {
    rhq[i] = Modulus(q, nq)(rhq[i] + m[i]);
  }
  for(var i = N; i<newSize; i++) {
    rhq[i] = Modulus(q, nq)(rhq[i]);
  }

  var I[N+1];
  I[0] = 1;
  I[N] = q-1;
  VerifyDividePolynomials(q, nq, newSize, N+1)(rhq, I, quotient, remainder);
}

template VerifyDecrypt(q, nq, p, np, N) {
  signal input f[N];
  signal input fp[N];
  signal input e[N];
  var newSize = N + N - 1;
  signal input quotient1[N+1];
  signal input remainder1[N+1];
  signal input quotient2[N+1];
  signal input remainder2[N+1];

  var a[newSize] = MultiplyPolynomialsMod(N, q, nq)(f, e);

  var I[N+1];
  I[0] = 1;
  I[N] = q-1;
  VerifyDividePolynomials(q, nq, newSize, N+1)(a, I, quotient1, remainder1);

  var b[N];
  for(var i = 0; i < N; i++) {
    var gt = LessThan(nq)([ q/2, remainder1[i] ]);
    b[i] = Modulus(p, np)(remainder1[i] + gt);
  }

  var c[newSize] = MultiplyPolynomialsMod(N, p, np)(fp, b);

  I[N] = p-1;
  VerifyDividePolynomials(p, np, newSize, N+1)(c, I, quotient2, remainder2);

}

// Use to encrypt a value and ensure that the user also knows the private key
template VerifyEncryptAndDecrypt(q, nq, p, np, N) {
  // Encryption signals
  signal input r[N]; // randomness
  signal input m[N]; // plaintext
  signal input h[N]; // pubkey
  // All "+1" signals have 0 as the last value; it's just to match the I value
  signal input quotientE[N+1]; // intermediate value
  signal input remainderE[N+1]; // ciphertext

  // Decryption signals
  signal input f[N]; // privatekey
  signal input fp[N]; // privatekey-ish
  signal input quotient1[N+1]; // intermediate value
  signal input remainder1[N+1]; // intermediate value
  signal input quotient2[N+1]; // intermediate value

  VerifyEncrypt(q, nq, N)(r, m, h, quotientE, remainderE);

  component dec = VerifyDecrypt(q, nq, p, np, N);
  dec.f <== f;
  dec.fp <== fp;
  for(var i = 0; i < N; i++) {
    dec.e[i] <== remainderE[i];
  }
  dec.quotient1 <== quotient1;
  dec.remainder1 <== remainder1;
  dec.quotient2 <== quotient2;
  for(var i = 0; i < N; i++) {
    dec.remainder2[i] <== m[i];
  }
  dec.remainder2[N] <== 0;
}
