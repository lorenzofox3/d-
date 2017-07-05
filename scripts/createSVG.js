const fs = require('fs');
const path = require('path');
const transformer = require('@mapbox/svg-react-transformer');


const inputFolder = path.join(process.cwd(), './src/icons/SVG');
const outputFile = path.join(process.cwd(), './src/components/icons.js');

const outputStream = fs.createWriteStream(outputFile);
outputStream.write(`import {h} from 'flaco';`);

for (let icon of fs.readdirSync(inputFolder)) {
  const [iconName] = icon.split('.');
  const ComponentName = iconName.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.substr(1, word.length - 1))
    .join('');
  const content = fs.readFileSync(path.join(inputFolder, icon));
  transformer.svgToJsx(content, {removeTitle: true})
    .then(svg => {
      const component = `
export const ${ComponentName} = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
${svg}
</span>)};
`;
      outputStream.write(component);
    });
}


