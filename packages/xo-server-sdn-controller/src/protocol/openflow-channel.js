import createLogger from '@xen-orchestra/log'
import openflow from '@xen-orchestra/openflow'
import util from 'util'
import Stream from '@xen-orchestra/openflow/dist/stream'

// =============================================================================

const log = createLogger('xo:xo-server:sdn-controller:openflow-controller')

const version = openflow.version.openFlow11
const protocol = openflow.protocol[version]
const OPENFLOW_PORT = protocol.sslPort

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

    log.debug('New OpenFlow channel', {
      host: this.host.name_label,
    })
  }

  // ---------------------------------------------------------------------------

  _processMessage(message, socket) {
    if (message.header === undefined) {
      log.error('Failed to get header while processing message', {
        message: util.inspect(message),
      })
      return
    }

    log.info('*** MESSAGE RECEIVED', { message: message })
    const ofType = message.header.type
    switch (ofType) {
      case protocol.type.hello:
        this._sendPacket(
          this._syncMessage(protocol.type.hello, message),
          socket
        )
        this._sendPacket(
          this._syncMessage(protocol.type.featuresRequest, message),
          socket
        )
        break
      case protocol.type.error:
        {
          const { code, data, type } = message
          log.error('OpenFlow error', {
            code,
            type,
            data: openflow.toJson(data),
          })
        }
        break
      case protocol.type.echoRequest:
        this._sendPacket(
          this._syncMessage(protocol.type.echoReply, message),
          socket
        )
        break
      case protocol.type.packetIn:
        log.info('PACKET_IN')
        break
      case protocol.type.featuresReply:
        {
          const { datapath_id: dpid, capabilities, ports } = message
          log.info('FEATURES_REPLY', { dpid, capabilities, ports })
          this._sendPacket(
            this._syncMessage(protocol.type.getConfigRequest, message),
            socket
          )
        }
        break
      case protocol.type.getConfigReply:
        {
          const { flags } = message
          log.info('CONFIG_REPLY', { flags })
          this._addFlow(
            {
              nw_src: '192.168.0.65',
              tp_dst: 5060,
            },
            socket
          )
          setTimeout(() => {
            this._removeFlows(
              {
                nw_src: '192.168.0.65',
                tp_dst: 5060,
              },
              socket
            )
          }, 100000)
        }
        break
      case protocol.type.portStatus:
        log.info('PORT_STATUS')
        break
      case protocol.type.flowRemoved:
        log.info('FLOW_REMOVED')
        break
      default:
        log.error('Unknown OpenFlow type', { ofType })
        break
    }
  }

  _addFlow(flow, socket) {
    // TODO
    const packet = this._flowModMessage(flow, protocol.flowModCommand.add)
    this._sendPacket(packet, socket)
  }

  _removeFlows(flow, socket) {
    // TODO
    const packet = this._flowModMessage(flow, protocol.flowModCommand.delete)
    packet.priority++
    this._sendPacket(packet, socket)
  }

  // ---------------------------------------------------------------------------

  _syncMessage(type, obj) {
    return {
      header: {
        version,
        type,
        length: 8,
        xid: obj.header.xid ?? 1,
      },
    }
  }

  _flowModMessage(flow, command, out_port = 0) {
    return {
      header: {
        version,
        type: protocol.type.flowMod,
        length: 160,
        xid: 1,
      },
      command,
      flags: protocol.flowModFlags.sendFlowRem,
      match: {
        type: protocol.matchType.standard,
        dl_type: 2048,
        nw_src: flow.nw_src,
      },
      instructions: [
        {
          type: protocol.instructionType.writeActions,
          actions: [
            /*
            {
              type: protocol.actionType.output,
              port: 0,
            },
          */
          ],
        },
      ],
    }
  }

  _extractFlow(packet) {
    return {
      dl_src: packet.shost,
      dl_dst: packet.dhost,
      dl_type: packet.ethertype,

      dl_vlan: packet.vlan ?? 0xffff,
      dl_vlan_pcp: packet.vlan !== undefined ? packet.priority : 0,

      nw_src: packet.ip !== undefined ? packet.ip.saddr : '0.0.0.0',
      nw_dst: packet.ip !== undefined ? packet.ip.daddr : '0.0.0.0',
      nw_proto: packet.ip !== undefined ? packet.ip.protocol : 0,

      tp_src:
        packet.ip.tcp !== undefined || packet.ip.udp !== undefined
          ? packet.ip.saddr
          : packet.ip.icmp !== undefined
          ? packet.ip.icmp.type
          : '0.0.0.0',
      tp_dst:
        packet.ip.tcp !== undefined || packet.ip.udp !== undefined
          ? packet.ip.daddr
          : packet.ip.icmp !== undefined
          ? packet.ip.icmp.code
          : '0.0.0.0',
    }
  }

  // ---------------------------------------------------------------------------

  async _sendPacket(packet, socket) {
    const buf = openflow.fromJson(packet)

    log.info('*** SENDING', { data: JSON.stringify(packet), packet })
    const unpacked = openflow.toJson(buf)
    log.info('*** SENDING 2', { data: JSON.stringify(unpacked), unpacked })

    try {
      socket.write(buf)
    } catch (error) {
      log.error('Error while writing into socket', {
        error,
        host: this.host.name_label,
      })
    }
  }

  // ---------------------------------------------------------------------------

  async _connect() {
    const socket = await this._tlsHelper.connect(
      this.host.address,
      OPENFLOW_PORT
    )
    socket.on('data', data => {
      const msgs = this._stream.process(data)
      msgs.forEach(msg => {
        if (msg.header !== undefined) {
          this._processMessage(msg, socket)
        } else {
          log.error('Error: Message is unparseable', { msg })
        }
      })
    })
    return socket
  }
}
