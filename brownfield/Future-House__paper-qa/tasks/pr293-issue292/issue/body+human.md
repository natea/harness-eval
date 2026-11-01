# Parsing JSON with newlines

_Opened by @whitead_

If the model response looks like:

```
{
  "summary": "The excerpt discusses different approaches to representing protein structures for machine learning, including equivariant methods. It mentions that scalar quantities of proteins like interaction interfaces are intrinsically rotation and translation invariant. The text describes several equivariant approaches:

1. Tensor Field Networks (TFN) using rotation equivariant convolutions based on spherical harmonics
2. Cormorant networks improving on TFN with Clebsch-Gordan non-linearity 
3. Geometric vector perceptron (GVP) using linear operations on vectors respecting rotation equivariance
4. Equivariant graph neural networks

The excerpt notes that TFN architectures have been successful in predicting protein-protein complex quality. However, it does not explicitly state that equivariant layers are definitively better at modeling protein structure compared to other approaches.",
  "relevance_score": 7
}
```

we do not parse it correctly. We should be able to handle that.
