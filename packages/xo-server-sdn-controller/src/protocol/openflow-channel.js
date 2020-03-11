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

    this._bridge = {}

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
          this._syncMessage(protocol.type.hello, message.header.xid),
          socket
        )
        this._sendPacket(
          this._syncMessage(protocol.type.featuresRequest, message.header.xid),
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
          this._syncMessage(protocol.type.echoReply, message.header.xid),
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
          this._bridge[dpid] = ports
          this._sendPacket(
            this._syncMessage(
              protocol.type.getConfigRequest,
              message.header.xid
            ),
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
              type: protocol.matchType.standard,
              dl_type: protocol.dlType.ip,
              dl_src: '96:08:d2:fc:69:19',
              nw_proto: protocol.nwProto.tcp,
              nw_src: '192.168.0.65',
              tp_src: 5060,
            },
            [
              {
                type: protocol.instructionType.applyActions,
                actions: [
                  {
                    type: protocol.actionType.output,
                    port: protocol.port.normal,
                  },
                ],
              },
            ],
            socket
          )
          setTimeout(() => {
            this._removeFlows(
              {
                type: protocol.matchType.standard,
                dl_type: 2048,
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

  _addFlow(match, instructions, socket) {
    // TODO
    const packet = this._flowModMessage(
      protocol.flowModCommand.add,
      match,
      instructions
    )
    this._sendPacket(packet, socket)
  }

  _removeFlows(match, socket) {
    // TODO
    const packet = this._flowModMessage(protocol.flowModCommand.delete, match)
    this._sendPacket(packet, socket)
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
      ...this._syncMessage(protocol.type.flowMod),
      command,
      flags: protocol.flowModFlags.sendFlowRem,
      match,
      instructions,
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
