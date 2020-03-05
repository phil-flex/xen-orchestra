import assert from 'assert'
import echo from './message/echo'
import error from './message/error'
import hello from './message/hello'
import featuresRequest from './message/features-request'
import featuresReply from './message/features-reply'
import getConfigRequest from './message/get-config-request'
import switchConfig from './message/switch-config'
import flowMod from './message/flow-mod'
import of from './openflow-11'

// =============================================================================

const FROM_JSON = {
  [of.type.hello]: hello.fromJson,
  [of.type.error]: error.fromJson,
  [of.type.featuresRequest]: featuresRequest.fromJson,
  [of.type.featuresReply]: featuresReply.fromJson,
  [of.type.echoRequest]: echo.fromJson,
  [of.type.echoReply]: echo.fromJson,
  [of.type.getConfigRequest]: getConfigRequest.fromJson,
  [of.type.getConfigReply]: switchConfig.fromJson,
  [of.type.setConfig]: switchConfig.fromJson,
  [of.type.flowMod]: flowMod.fromJson,
}

const TO_JSON = {
  [of.type.hello]: hello.toJson,
  [of.type.error]: error.toJson,
  [of.type.featuresRequest]: featuresRequest.toJson,
  [of.type.featuresReply]: featuresReply.toJson,
  [of.type.echoRequest]: echo.toJson,
  [of.type.echoReply]: echo.toJson,
  [of.type.getConfigRequest]: getConfigRequest.toJson,
  [of.type.getConfigReply]: switchConfig.toJson,
  [of.type.setConfig]: switchConfig.toJson,
  [of.type.flowMod]: flowMod.toJson,
}

// =============================================================================

export default {
  protocol: of,

  // ---------------------------------------------------------------------------

  fromJson: object => {
    const type = object.header.type
    assert(Object.keys(FROM_JSON).includes(String(type)))

    return FROM_JSON[type](object)
  },

  toJson: (buffer, offset = 0) => {
    const type = buffer.readUInt8(offset + of.offsets.header.type)
    assert(Object.keys(TO_JSON).includes(String(type)))

    return TO_JSON[type](buffer, offset)
  },
}
