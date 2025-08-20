const xml2js = require('xml2js');

// Test XML fragment from the EPG
const testXML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <programme start="20250820212000 +0000" stop="20250820221000 +0000" channel="mjh-discovery-hgtv">
    <title>Flip the Strip</title>
    <sub-title>Vegas Glam</sub-title>
    <desc>The guys of Thunder From Down Under... turn a couple's dated '90s home into a Vegas-glam showstopper.</desc>
  </programme>
</tv>`;

const parser = new xml2js.Parser({
  explicitArray: false,
  ignoreAttrs: false,
  mergeAttrs: true
});

parser.parseStringPromise(testXML)
  .then(result => {
    console.log('Parsed XML structure:');
    console.log(JSON.stringify(result, null, 2));
    
    const programmes = Array.isArray(result.tv.programme) ? result.tv.programme : [result.tv.programme];
    const programme = programmes[0];
    
    console.log('\nFirst programme object:');
    console.log('programme.channel:', programme.channel);
    console.log('programme.start:', programme.start);
    console.log('programme.stop:', programme.stop);
    console.log('programme.title:', programme.title);
    
    console.log('\nValidation check:');
    console.log('Has channel:', !!programme.channel);
    console.log('Has start:', !!programme.start);
    console.log('Has stop:', !!programme.stop);
  })
  .catch(error => {
    console.error('XML parsing failed:', error);
  });