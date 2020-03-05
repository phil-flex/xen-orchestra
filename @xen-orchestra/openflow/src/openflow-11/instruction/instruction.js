import assert from 'assert'
import actions from './actions'
// import goToTable from './goToTable'
import of from '../openflow-11'
// import writeMetadata from './writeMetadata'

// =============================================================================

const FROM_JSON = {
  /* TODO:
  [of.instructionType.goToTable]: goToTable.fromJson,
  [of.instructionType.writeMetadata]: writeMetadata.fromJson,
  */
  [of.instructionType.writeActions]: actions.fromJson,
  [of.instructionType.applyActions]: actions.fromJson,
  [of.instructionType.clearActions]: actions.fromJson,
}

const TO_JSON = {
  /* TODO:
  [of.instructionType.goToTable]: goToTable.toJson,
  [of.instructionType.writeMetadata]: writeMetadata.toJson,
  */
  [of.instructionType.writeActions]: actions.toJson,
  [of.instructionType.applyActions]: actions.toJson,
  [of.instructionType.clearActions]: actions.toJson,
}

// -----------------------------------------------------------------------------

const OFFSETS = of.offsets.instruction

// =============================================================================

export default {
  fromJson: (object, buffer = undefined, offset = 0) => {
    const { type } = object
    assert(Object.keys(FROM_JSON).includes(String(type)))

    return FROM_JSON[type](object, buffer, offset)
  },

  toJson: (buffer = undefined, offset = 0) => {
    const type = buffer.readUInt16BE(offset + OFFSETS.type)
    assert(Object.keys(TO_JSON).includes(String(type)))

    return TO_JSON[type](buffer, offset)
  },
}
