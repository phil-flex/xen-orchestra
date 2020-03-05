import assert from 'assert'
import ofVersion from './version'
// TODO: More openflow versions
import of11 from './openflow-11/index'
import scheme from './default-header-scheme'

// =============================================================================

const FROM_JSON = {
  [ofVersion.openFlow11]: of11.fromJson,
}

const TO_JSON = {
  [ofVersion.openFlow11]: of11.toJson,
}

// =============================================================================

export default {
  version: ofVersion,
  protocol: { [ofVersion.openFlow11]: of11.protocol },

  // ---------------------------------------------------------------------------

  fromJson: object => {
    const version = object.header.version
    assert(Object.values(ofVersion).includes(version))

    return FROM_JSON[version](object)
  },

  toJson: (buffer, offset = 0) => {
    const version = buffer.readUInt8(offset + scheme.offsets.version)
    assert(Object.values(ofVersion).includes(version))

    return TO_JSON[version](buffer, offset)
  },
}
