/*
 * WOWZA MEDIA SYSTEMS, LLC ("Wowza") CONFIDENTIAL
 *  © 2021 Wowza Media Systems, LLC. All rights reserved.
 *
 * NOTICE: All information contained herein is, and remains the property of Wowza Media Systems, LLC.
 * The intellectual and technical concepts contained herein are proprietary to Wowza Media Systems, LLC
 * and may be covered by U.S. and Foreign Patents, patents in process, and are protected by trade secret
 * or copyright law. Dissemination of this information or reproduction of this material is strictly forbidden
 * unless prior written permission is obtained from Wowza Media Systems, LLC. Access to the source code
 * contained herein is hereby forbidden to anyone except current Wowza Media Systems, LLC employees, managers
 * or contractors who have executed Confidentiality and Non-disclosure agreements explicitly covering such access.
 *
 * The copyright notice above does not evidence any actual or intended publication or disclosure of this
 * source code, which includes information that is confidential and/or proprietary, and is a trade secret, of
 * Wowza Media Systems, LLC. ANY REPRODUCTION, MODIFICATION, DISTRIBUTION, PUBLIC PERFORMANCE, OR PUBLIC DISPLAY
 * OF OR THROUGH USE OF THIS SOURCE CODE WITHOUT THE EXPRESS WRITTEN CONSENT OF WOWZA MEDIA SYSTEMS, LLC IS
 * STRICTLY PROHIBITED, AND IN VIOLATION OF APPLICABLE LAWS AND INTERNATIONAL TREATIES. THE RECEIPT OR POSSESSION
 * OF THIS SOURCE CODE AND/OR RELATED INFORMATION DOES NOT CONVEY OR IMPLY ANY RIGHTS TO REPRODUCE, DISCLOSE OR
 * DISTRIBUTE ITS CONTENTS, OR TO MANUFACTURE, USE, OR SELL ANYTHING THAT IT MAY DESCRIBE, IN WHOLE OR IN PART.
 *
 *
 */

const wowza = window.wowza
let streamName = window.streamName

class WowzaPlayer {
  constructor () {
    const href = new URL(window.location.href)
    this.streamName = (href.searchParams.get('streamName')) ? href.searchParams.get('streamName') : streamName
    this.playing = false
    this.disableVideo = href.searchParams.get('disableVideo') === 'true'
    this.disableAudio = href.searchParams.get('disableAudio') === 'true'
    const tokenGenerator = () => wowza.Director.getSubscriber({ streamName: this.streamName })
    this.wowzaView = new wowza.View(this.streamName, tokenGenerator)
    this.tracks = []
  }

  async init () {
    await this.subscribe()
  }

  async subscribe () {
    try {
      this.wowzaView.on('track', (event) => {
        this.tracks.push(event)
        console.log('Event from newTrack: ', event)
        this.addStreamToVideoTag(event)
      })
      this.wowzaView.on('broadcastEvent', (event) => {
        console.log('Event from broadcastEvent: ', event)
      })

      const options = {
        disableVideo: this.disableVideo,
        disableAudio: this.disableAudio
      }
      this.wowzaView.on('connectionStateChange', (state) => {
        console.log('Event from connectionStateChange: ', state)
      })
      await this.wowzaView.connect(options)
    } catch (error) {
      console.log('There was an error while trying to connect with the publisher')
      this.wowzaView.reconnect()
    }
  }

  addStreamToVideoTag (event) {
    this.addStream(event.streams[0])
  }

  addStream (stream) {
    const player = document.getElementById('wowza-player')
    const video = document.querySelector('video')
    if (this.disableVideo) {
      player.removeChild(video)
      const audio = document.createElement('audio')
      player.appendChild(audio)
      audio.controls = true
      audio.autoplay = true
      audio.srcObject = stream
    } else {
      video.srcObject = stream
    }
    this.playing = true
  }

  async stop() {
    this.wowzaView.stop();
  }
}

const wowzaPlayer = new WowzaPlayer()
wowzaPlayer.init()
