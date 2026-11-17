// The JSON Schema layer of `specs validate` — the reference validator from
// @directededges/specs-schema-core, which compiles the schema set from
// @directededges/specs-schema once per process. This module held its own ajv
// registry while no reference validator existed; now it is the seam the rest
// of `validate` reaches the shared engine through.

export {
  concernValidators,
  describeAjvError,
  isMissingSourceError,
  type ConcernName,
  type ConcernValidators,
} from '@directededges/specs-schema-core';
