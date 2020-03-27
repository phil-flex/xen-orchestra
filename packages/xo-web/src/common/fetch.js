import 'whatwg-fetch'

const { fetch } = window
export { fetch as default }

export const post = (url, body, opts) =>
  {
    //console.log('fetch.js original url: ' + url)
    //FIXME: Workaround for adding /xo custom root url if it is not in the url.
    //var xourl = (url.indexOf("/xo")?'/xo/':'') + url
    var xourl = ((url.substr(0,4)==='/xo/')?'':'/xo') + url
    //console.log('fetch.js pathed url: ' + xourl)
    fetch(xourl, {
      ...opts,
      body,
      method: 'POST',
    })
  }
