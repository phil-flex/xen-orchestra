import createLogger from '@xen-orchestra/log'
import ipaddr from 'ipaddr.js'
import openflow from '@xen-orchestra/openflow'
import util from 'util'
import Stream from '@xen-orchestra/openflow/dist/stream'

// =============================================================================

const log = createLogger('xo:xo-server:sdn-controller:openflow-controller')

const version = openflow.version.openFlow11
const ofProtocol = openflow.protocol[version]
const OPENFLOW_PORT = ofProtocol.sslPort

// -----------------------------------------------------------------------------

const parseIp = ipAddress => {
  let addr, mask
  if (ipAddress.includes('/')) {
    const ip = ipaddr.parseCIDR(ipAddress)
    addr = ip[0].toString()
    const maskOctets = ipaddr.IPv4.subnetMaskFromPrefixLength(ip[1]).octets
    mask = ipaddr.fromByteArray(maskOctets.map(i => 255 - i)).toString() // Use wildcarded mask
  } else {
    const ip = ipaddr.parse(ipAddress)
    addr = ip.toString()
  }

  return { addr, mask }
}

// =============================================================================

export class OpenFlowChannel {
  /*
  Create an SSL connection to an XCP-ng host.
  Interact with the host's OpenVSwitch (OVS) daemon to manage its flows with OpenFlow11.
  See:
  - OpenFlow11 spec: https://www.opennetworking.org/wp-content/uploads/2014/10/openflow-spec-v1.1.0.pdf
  */

  constructor(host, tlsHelper) {
    this.host = host
    this._tlsHelper = tlsHelper
    this._stream = new Stream()

    this._bridge = {}

    log.debug('New OpenFlow channel', {
      host: this.host.name_label,
    })
  }

  // ---------------------------------------------------------------------------

  addRule(vif, allow, protocol, port, ipRange, direction) {
    // TODO: use VIF to get bridge port

    const instructions = [
      {
        type: ofProtocol.instructionType.applyActions,
        actions: allow
          ? [
              {
                type: ofProtocol.actionType.output,
                port: ofProtocol.port.normal,
              },
            ]
          : [],
      },
    ]

    const ip = parseIp(ipRange)
    log.info('*** -------------', { ip })

    let dlType, nwProto
    if (protocol === 'IP') {
      dlType = ofProtocol.dlType.ip
    } else if (protocol === 'TCP') {
      dlType = ofProtocol.dlType.ip
      nwProto = ofProtocol.nwProto.tcp
    } else if (protocol === 'UDP') {
      dlType = ofProtocol.dlType.ip
      nwProto = ofProtocol.nwProto.udp
    } else {
      // ERROR?
    }

    if (direction.includes('from')) {
      this._addFlow(
        {
          type: ofProtocol.matchType.standard,
          dl_type: dlType,
          // dl_src: TODO,
          nw_proto: nwProto,
          nw_dst: ip.addr,
          nw_dst_mask: ip.mask,
          tp_src: port,
        },
        instructions
      )
      this._addFlow(
        {
          type: ofProtocol.matchType.standard,
          dl_type: dlType,
          // dl_dst: TODO,
          nw_proto: nwProto,
          nw_src: ip.addr,
          nw_src_mask: ip.mask,
          tp_dst: port,
        },
        instructions
      )
    }
    if (direction.includes('to')) {
      this._addFlow(
        {
          type: ofProtocol.matchType.standard,
          dl_type: dlType,
          // dl_src: TODO,
          nw_proto: nwProto,
          nw_dst: ip.addr,
          nw_dst_mask: ip.mask,
          tp_dst: port,
        },
        instructions
      )
      this._addFlow(
        {
          type: ofProtocol.matchType.standard,
          dl_type: dlType,
          // dl_dst: TODO,
          nw_proto: nwProto,
          nw_src: ip.addr,
          nw_src_mask: ip.mask,
          tp_src: port,
        },
        instructions
      )
    }
  }

  deleteRule(vif, protocol, port, ipRange, direction) {
    // TODO: use VIF to get bridge port

    const ip = parseIp(ipRange)
    log.info('*** -------------', { ip })
    let dlType, nwProto
    if (protocol === 'IP') {
      dlType = ofProtocol.dlType.ip
    } else if (protocol === 'TCP') {
      dlType = ofProtocol.dlType.ip
      nwProto = ofProtocol.nwProto.tcp
    } else if (protocol === 'UDP') {
      dlType = ofProtocol.dlType.ip
      nwProto = ofProtocol.nwProto.udp
    } else {
      // ERROR?
    }

    if (direction.includes('from')) {
      this._removeFlows({
        type: ofProtocol.matchType.standard,
        dl_type: dlType,
        // dl_src: TODO,
        nw_proto: nwProto,
        nw_dst: ip.addr,
        nw_dst_mask: ip.mask,
        tp_src: port,
      })
      this._removeFlows({
        type: ofProtocol.matchType.standard,
        dl_type: dlType,
        // dl_dst: TODO,
        nw_proto: nwProto,
        nw_src: ip.addr,
        nw_src_mask: ip.mask,
        tp_dst: port,
      })
    }
    if (direction.includes('to')) {
      this._removeFlows({
        type: ofProtocol.matchType.standard,
        dl_type: dlType,
        // dl_src: TODO,
        nw_proto: nwProto,
        nw_dst: ip.addr,
        nw_dst_mask: ip.mask,
        tp_dst: port,
      })
      this._removeFlows({
        type: ofProtocol.matchType.standard,
        dl_type: dlType,
        // dl_dst: TODO,
        nw_proto: nwProto,
        nw_src: ip.addr,
        nw_src_mask: ip.mask,
        tp_src: port,
      })
    }
  }

  // ===========================================================================

  _processMessage(message) {
    if (message.header === undefined) {
      log.error('Failed to get header while processing message', {
        message: util.inspect(message),
      })
      return
    }

    log.info('*** MESSAGE RECEIVED', { message: message })
    const ofType = message.header.type
    switch (ofType) {
      case ofProtocol.type.hello:
        this._sendPacket(
          this._syncMessage(ofProtocol.type.hello, message.header.xid)
        )
        this._sendPacket(
          this._syncMessage(ofProtocol.type.featuresRequest, message.header.xid)
        )
        break
      case ofProtocol.type.error:
        {
          const { code, type } = message
          log.error('OpenFlow error', {
            code,
            type,
            // data: openflow.toJson(data),
          })
        }
        break
      case ofProtocol.type.echoRequest:
        this._sendPacket(
          this._syncMessage(ofProtocol.type.echoReply, message.header.xid)
        )
        break
      case ofProtocol.type.packetIn:
        log.info('PACKET_IN')
        break
      case ofProtocol.type.featuresReply:
        {
          const { datapath_id: dpid, capabilities, ports } = message
          log.info('FEATURES_REPLY', { dpid, capabilities, ports })
          this._bridge[dpid] = ports
          this._sendPacket(
            this._syncMessage(
              ofProtocol.type.getConfigRequest,
              message.header.xid
            )
          )
        }
        break
      case ofProtocol.type.getConfigReply:
        {
          const { flags } = message
          log.info('CONFIG_REPLY', { flags })
          this.addRule(undefined, true, 'TCP', 5060, '192.168.42.42/17', 'from')
          setTimeout(() => {
            this.deleteRule(undefined, 'TCP', 5060, '192.168.42.42/17', 'from')
          }, 100000)
        }
        break
      case ofProtocol.type.portStatus:
        log.info('PORT_STATUS')
        break
      case ofProtocol.type.flowRemoved:
        log.info('FLOW_REMOVED')
        break
      default:
        log.error('Unknown OpenFlow type', { ofType })
        break
    }
  }

  _addFlow(match, instructions) {
    // TODO
    const packet = this._flowModMessage(
      ofProtocol.flowModCommand.add,
      match,
      instructions
    )
    this._sendPacket(packet)
  }

  _removeFlows(match) {
    // TODO
    const packet = this._flowModMessage(ofProtocol.flowModCommand.delete, match)
    this._sendPacket(packet)
  }

  // ---------------------------------------------------------------------------

  _syncMessage(type, xid = 1) {
    return {
      header: {
        version,
        type,
        xid,
      },
    }
  }

  _flowModMessage(command, match, instructions = []) {
    // TODO: Do not use default priority?
    return {
      ...this._syncMessage(ofProtocol.type.flowMod),
      command,
      flags: ofProtocol.flowModFlags.sendFlowRem,
      match,
      instructions,
    }
  }

  // ---------------------------------------------------------------------------

  async _sendPacket(packet) {
    const buf = openflow.fromJson(packet)

    log.info('*** SENDING', { data: JSON.stringify(packet), packet })
    const unpacked = openflow.toJson(buf)
    log.info('*** SENDING 2', { data: JSON.stringify(unpacked), unpacked })

    try {
      this._socket.write(buf)
    } catch (error) {
      log.error('Error while writing into socket', {
        error,
        host: this.host.name_label,
      })
    }
  }

  // ---------------------------------------------------------------------------

  async _connect() {
    this._socket = await this._tlsHelper.connect(
      this.host.address,
      OPENFLOW_PORT
    )
    this._socket.on('data', data => {
      const msgs = this._stream.process(data)
      msgs.forEach(msg => {
        if (msg.header !== undefined) {
          this._processMessage(msg)
        } else {
          log.error('Error: Message is unparseable', { msg })
        }
      })
    })
  }
}
