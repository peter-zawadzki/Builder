import { baselineModel } from '../data/baseline';
import { calculateModel, ENGINE_VERSION } from '../engine/index';

export const baselineResults = calculateModel({
  modelVersionId: 'baseline-v1',
  engineVersion: ENGINE_VERSION,
  baseline: baselineModel,
  overrides: {},
});
