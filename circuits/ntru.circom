pragma circom 2.1.0;

include "comparators.circom";

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

// Imagine the coefficients are like trains passing in opposite directions
// For example:
//   n=4
//   a=1,2,3,4 (4x^3 + 3x^2 + 2x + 1)
//   b=6,5,4,3 (3x^3 + 4x^2 + 5x + 6)
//
// 4,3,2,1 --->
//         <--- 6,5,4,3
//
// 4,3,2,1
//       6,5,4,3
//       ^ coeff #0 = 6*1
//
// 4,3,2,1
//     6,5,4,3
//     ^ ^ coeff #1 = 1*5 + 2*6
//
// 4,3,2,1
//   6,5,4,3
//   ^ ^ ^ coeff #2 = 1*4 + 2*5 + 3*6
//
// 4,3,2,1
// 6,5,4,3
// ^ ^ ^ ^ coeff #3 = 1*3 + 2*4 + 3*5 + 4*6
//
//   4,3,2,1
// 6,5,4,3
//   ^ ^ ^ coeff #4 = 2*3 + 3*4 + 4*5
//
//     4,3,2,1
// 6,5,4,3
//     ^ ^ coeff #5 = 3*3 + 4*4
//
//       4,3,2,1
// 6,5,4,3
//       ^ coeff #6 = 4*3
//
// Output: 6, 17, 32, 50, 38, 25, 12
// (12x^6 + 25x^5 + 38x^4 + 50x^3 + 32x^2 + 17x + 6)

template MultiplyPolynomials(n) {
  var newSize = n + n - 1;
  signal input a[n];
  signal input b[n];

  signal output result[newSize];

  // First and last coefficients are simple constraints
  result[0] <== a[0] * b[0];
  result[newSize-1] <== a[n-1] * b[n-1];

  component sums[newSize - 2];
  for(var k = 1; k < newSize - 1; k++) {
    var sumSize = 2 * n - k - 1;
    if(k < n) {
      sumSize = k + 1;
    }
    sums[k-1] = Sum(sumSize);
    for(var i = 0; i < sumSize; i++) {
      var aIndex = k - n + 1 + i;
      if(k < n) {
        aIndex = i;
      }
      var bIndex = k - aIndex;
      if(aIndex >= 0 && aIndex < n && bIndex >= 0 && bIndex < n) {
        sums[k-1].in[i] <== a[aIndex] * b[bIndex];
      }
    }

    result[k] <== sums[k-1].out;
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

  // product + remainder = dividend
  component eq[Na];
  // TODO this fails beyond i<167
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

// TODO need to check f matches fp?
// this would be done by checking f,fp,h all together by encrypting a known value
// and successfully decrypting it
// is there an easy attack on that?
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
