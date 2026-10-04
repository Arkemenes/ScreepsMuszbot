# 0114 — notas: simulação do tamanho do miner por capacidade

Reproduzir: `node specs/features/0114-consolidated-miner/simulate-body.js`.

## Modelo

Por source de 3000 (owned), ciclo de 300 ticks, vida 1500:

- `harvests = ceil(3000 / 2W)`; `transfers` simulados com a regra de batch do
  `miner.distribute()` (transfere quando `free < 2W`); `C=0` ⇒ 0 transfers
  (overflow cai no container).
- CPU = 0.2 × (harvests + transfers) / 300 por source (premissa do profile
  2026-10-02 — **não verificada**; medir com `cpuMeter`).
- Viagem: `D × ceil(W/M)` ticks (plain, CARRY vazio); restrição `travel ≤ 150`.
- Energia = `custo / (1500 − travel)` por tick (o replacement só começa a
  render depois de andar).
- Utilidade = `−λ·CPU − energia`; `λ` = energia que 1 CPU/tick vale.
- Baseline hoje: 5W/1M/1C → 0.24 CPU/source, 0.44 energia/tick/source.

## Resultado (2 sources, D=25 tiles, deltas vs hoje)

| capacidade | λ=10 | λ=20 | λ=40 |
| --- | --- | --- | --- |
| 800 (RCL3) | W6/M1/C3 · −0.12 CPU · +0.3 E | = | = |
| 1300 (RCL4) | W10/M2/C4 · −0.26 · +1.0 | = | = |
| 1800 (RCL5) | W12/M3/C3 · −0.29 · +1.3 | W15/M3/C3-4 · −0.32 · +1.7 | = |
| 2300 (RCL6) | W12/M3/C3 · −0.29 · +1.3 | W15/M3/C5 $1900 · −0.33 · +1.9 | W18-19/M3/C5-6 $2250-2300 · −0.35 · +2.4 |
| 3000+ (RCL7 parcial) | = | = | W24/M4/C8 $3000 · −0.39 · +3.4 |
| 5600+ (RCL7/8) | = | = | W25/M5/C7 $3100 · −0.39 · +3.6 |

(CPU em CPU/tick somando as 2 sources; E = energia extra/tick; renda de 2
sources = 20/tick.)

## Conclusões

- Retorno decrescente: W12 ≈ 0.29, W15 ≈ 0.33, W25 ≈ 0.39 CPU/tick.
- Com λ moderado o corpo **estabiliza em ~1900 de custo**: RCL7/8 não compram
  mais WORK que RCL6 a não ser que λ suba.
- CARRY ideal é 3–5 (corta transfers de ~60 para ~15–20 por ciclo); o ótimo
  de MOVE é ~W/5 (viagem ≈ 4–5 ticks/tile... limitada por `travel ≤ 150`).
- Em D maior (40) o corpo pede mais MOVE e perde ~1 WORK.

## Grid search completo (`simulate-grid.js`)

`MINC=1 node simulate-grid.js pareto|carry` (link/torre adjacente ⇒ C ≥ 1),
`node simulate-grid.js mineral`. W 2..40 × M × C 0..6 × distância
perto/médio/longe (10/25/45 tiles) × política de transfer A (batch atual) / B
(só com store cheio).

### Energia, C ≥ 1, D=25, política B (por source)

| corpo | custo | CPU/t | E/t | preço (E por CPU poupado vs linha anterior) |
| --- | --- | --- | --- | --- |
| W5/M1/C1 (hoje) | 600 | 0.240 | 0.44 | — |
| W8/M2/C2 | 1000 | 0.143 | 0.71 | 4 |
| W10/M2/C3 | 1250 | 0.112 | 0.91 | 6 |
| W12/M3/C3 | 1500 | 0.095 | 1.07 | 9 |
| W15/M3/C4 | 1850 | 0.076 | 1.35 | 16 |
| W16/M4/C4 | 2000 | 0.071 | 1.43 | 18 |
| W20/M4/C5 | 2450 | 0.057 | 1.78 | 24 |
| W24/M6/C5 | 2950 | 0.049 | 2.11 | 41 |

- CARRY extra é a alavanca mais barata: cada CARRY custa 50 energia/vida
  (~0.035 E/tick) e poupa 0.01–0.03 CPU/tick por source (preço 2–10 E/CPU,
  contra 9–27 do WORK entre W12 e W20). Em sala de 2 sources, C1→C3–4 vale
  ~0.04–0.05 CPU/tick por ~0.2 E/tick.
- O joelho da curva está entre W12 (preço 9) e W15–16 (preço 16–18); a partir de
  W20 o preço passa de 24 E por CPU.

### mineralMiner (sempre C=0)

- Energia por unidade ≈ 0.40 independente de W (unidades/vida = `live·W/5`);
  W só muda velocidade e CPU/unidade (`0.2/W`: W8 0.025, W20 0.010).
- Taxa de longo prazo é limitada pela regen (50 000 ticks após esgotar):
  `amount / (Tm + 50000)`.

| densidade | amount | taxa W8 | taxa W12 | taxa W20 | gasto por depósito (W12) |
| --- | --- | --- | --- | --- | --- |
| LOW | 15 000 | 0.25 | 0.27 | 0.29 | 6 500 E |
| MODERATE | 35 000 | 0.49 | 0.54 | 0.60 | 14 300 E |
| HIGH | 70 000 | 0.75 | 0.88 | 1.04 | 28 600 E |
| ULTRA | 100 000 | 0.89 | 1.09 | 1.33 | 40 300 E |

- Creep spawnado para quantidade pequena desperdiça vida (W8): amount 200 → 9%
  ocupado, 4.5 E/unidade; 500 → 22%, 1.8; 1000 → 45%, 0.9; 2000 → 89%, 0.45.
- Esgotar em uma vida (W = ceil(5·amount/live)): 1000 → W4, 2000 → W7–8,
  5000 → W17–18; acima de 10 000 não cabe em 25 WORK.
