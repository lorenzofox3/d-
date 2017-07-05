import {h} from 'flaco';
export const AddressBook = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>address-book</title><path d="M6 0v32h24V0H6zm12 8.01a3.99 3.99 0 1 1 0 7.98 3.99 3.99 0 0 1 0-7.98zM24 24H12v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2zM2 2h3v6H2V2zM2 10h3v6H2v-6zM2 18h3v6H2v-6zM2 26h3v6H2v-6z"/></svg>
</span>)};

export const Bin2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>bin2</title><path d="M6 32h20l2-22H4zM20 4V0h-8v4H2v6l2-2h24l2 2V4H20zm-2 0h-4V2h4v2z"/></svg>
</span>)};

export const Bookmark = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>bookmark</title><path d="M6 0v32l10-10 10 10V0z"/></svg>
</span>)};

export const Bookmarks = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>bookmarks</title><path d="M8 4v28l10-10 10 10V4zm16-4H4v28l2-2V2h18z"/></svg>
</span>)};

export const Bubbles = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="36" height="32" viewBox="0 0 36 32"><title>bubbles</title><path d="M34 28.161a3.65 3.65 0 0 0 2 3.256v.498a7.42 7.42 0 0 1-6.414-2.251c-.819.218-1.688.336-2.587.336-4.971 0-9-3.582-9-8s4.029-8 9-8 9 3.582 9 8c0 1.73-.618 3.331-1.667 4.64a3.635 3.635 0 0 0-.333 1.522zM16 0c8.702 0 15.781 5.644 15.995 12.672A12.262 12.262 0 0 0 27 11.625c-2.986 0-5.807 1.045-7.942 2.943-2.214 1.968-3.433 4.607-3.433 7.432 0 1.396.298 2.747.867 3.993a19.66 19.66 0 0 1-2.987-.151C10.068 29.279 5.966 29.895 2 29.986v-.841C4.142 28.096 6 26.184 6 24c0-.305-.024-.604-.068-.897C2.313 20.72 0 17.079 0 13 0 5.82 7.163 0 16 0z"/></svg>
</span>)};

export const CheckboxChecked = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>checkbox-checked</title><path d="M28 0H4C1.8 0 0 1.8 0 4v24c0 2.2 1.8 4 4 4h24c2.2 0 4-1.8 4-4V4c0-2.2-1.8-4-4-4zM14 24.828l-7.414-7.414 2.828-2.828L14 19.172l9.586-9.586 2.828 2.828L14 24.828z"/></svg>
</span>)};

export const CheckboxUnchecked = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>checkbox-unchecked</title><path d="M28 0H4C1.8 0 0 1.8 0 4v24c0 2.2 1.8 4 4 4h24c2.2 0 4-1.8 4-4V4c0-2.2-1.8-4-4-4zm0 28H4V4h24v24z"/></svg>
</span>)};

export const Checkmark = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>checkmark</title><path d="M27 4L12 19l-7-7-5 5 12 12L32 9z"/></svg>
</span>)};

export const Checkmark2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>checkmark2</title><path d="M12.42 28.678L-.013 16.44l6.168-6.071 6.265 6.167L25.846 3.322l6.168 6.071L12.42 28.678zM3.372 16.441l9.048 8.905L28.628 9.393l-2.782-2.739L12.42 19.868l-6.265-6.167-2.782 2.739z"/></svg>
</span>)};

export const Cog = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>cog</title><path d="M29.181 19.07c-1.679-2.908-.669-6.634 2.255-8.328l-3.145-5.447a6.022 6.022 0 0 1-3.058.829c-3.361 0-6.085-2.742-6.085-6.125h-6.289a6.023 6.023 0 0 1-.811 3.07C10.369 5.977 6.637 6.966 3.709 5.28L.565 10.727a6.023 6.023 0 0 1 2.246 2.234c1.676 2.903.672 6.623-2.241 8.319l3.145 5.447a6.022 6.022 0 0 1 3.044-.82c3.35 0 6.067 2.725 6.084 6.092h6.289a6.032 6.032 0 0 1 .811-3.038c1.676-2.903 5.399-3.894 8.325-2.219l3.145-5.447a6.032 6.032 0 0 1-2.232-2.226zM16 22.479A6.48 6.48 0 1 1 16 9.52a6.48 6.48 0 0 1 0 12.959z"/></svg>
</span>)};

export const Connection = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="40" height="32" viewBox="0 0 40 32"><title>connection</title><path d="M20 18c3.308 0 6.308 1.346 8.481 3.519l-2.827 2.827C24.205 22.897 22.205 22 20 22s-4.206.897-5.654 2.346l-2.827-2.827A11.963 11.963 0 0 1 20 18zM5.858 15.858C9.635 12.081 14.658 10 20 10s10.365 2.08 14.142 5.858l-2.828 2.828C28.292 15.664 24.274 14 20 14s-8.292 1.664-11.314 4.686l-2.828-2.828zM30.899 4.201a27.89 27.89 0 0 1 8.899 6l-2.828 2.828C32.437 8.496 26.41 6 19.999 6S7.561 8.496 3.028 13.029L.2 10.201A27.917 27.917 0 0 1 19.998 2c3.779 0 7.446.741 10.899 2.201zM18 28a2 2 0 1 1 3.999-.001A2 2 0 0 1 18 28z"/></svg>
</span>)};

export const Cross = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>cross</title><path d="M31.708 25.708L22 16l9.708-9.708a1 1 0 0 0 0-1.414L27.122.292a1 1 0 0 0-1.414-.001L16 9.999 6.292.291a.998.998 0 0 0-1.414.001L.292 4.878a1 1 0 0 0 0 1.414L10 16 .292 25.708a.999.999 0 0 0 0 1.414l4.586 4.586a1 1 0 0 0 1.414 0L16 22l9.708 9.708a1 1 0 0 0 1.414 0l4.586-4.586a.999.999 0 0 0 0-1.414z"/></svg>
</span>)};

export const Embed = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>embed</title><path d="M18 23l3 3 10-10L21 6l-3 3 7 7zM14 9l-3-3L1 16l10 10 3-3-7-7z"/></svg>
</span>)};

export const Embed2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="40" height="32" viewBox="0 0 40 32"><title>embed2</title><path d="M26 23l3 3 10-10L29 6l-3 3 7 7zM14 9l-3-3L1 16l10 10 3-3-7-7zM21.916 4.704l2.171.592-6 22.001-2.171-.592 6-22.001z"/></svg>
</span>)};

export const Enlarge = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>enlarge</title><path d="M32 0H19l5 5-6 6 3 3 6-6 5 5zM32 32V19l-5 5-6-6-3 3 6 6-5 5zM0 32h13l-5-5 6-6-3-3-6 6-5-5zM0 0v13l5-5 6 6 3-3-6-6 5-5z"/></svg>
</span>)};

export const Enlarge2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>enlarge2</title><path d="M32 32H19l5-5-6-6 3-3 6 6 5-5zM11 14L5 8l-5 5V0h13L8 5l6 6z"/></svg>
</span>)};

export const Equalizer = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>equalizer</title><path d="M14 4v-.5c0-.825-.675-1.5-1.5-1.5h-5C6.675 2 6 2.675 6 3.5V4H0v4h6v.5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5V8h18V4H14zM8 8V4h4v4H8zm18 5.5c0-.825-.675-1.5-1.5-1.5h-5c-.825 0-1.5.675-1.5 1.5v.5H0v4h18v.5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5V18h6v-4h-6v-.5zM20 18v-4h4v4h-4zm-6 5.5c0-.825-.675-1.5-1.5-1.5h-5c-.825 0-1.5.675-1.5 1.5v.5H0v4h6v.5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5V28h18v-4H14v-.5zM8 28v-4h4v4H8z"/></svg>
</span>)};

export const Equalizer2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>equalizer2</title><path d="M28 14h.5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5H28V0h-4v6h-.5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h.5v18h4V14zm-4-6h4v4h-4V8zm-5.5 18c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5H18V0h-4v18h-.5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h.5v6h4v-6h.5zM14 20h4v4h-4v-4zm-5.5-6c.825 0 1.5-.675 1.5-1.5v-5C10 6.675 9.325 6 8.5 6H8V0H4v6h-.5C2.675 6 2 6.675 2 7.5v5c0 .825.675 1.5 1.5 1.5H4v18h4V14h.5zM4 8h4v4H4V8z"/></svg>
</span>)};

export const Filter = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>filter</title><path d="M16 0C7.163 0 0 2.239 0 5v3l12 12v10c0 1.105 1.791 2 4 2s4-.895 4-2V20L32 8V5c0-2.761-7.163-5-16-5zM2.95 4.338c.748-.427 1.799-.832 3.04-1.171C8.738 2.415 12.293 2 16.001 2s7.262.414 10.011 1.167c1.241.34 2.292.745 3.04 1.171.494.281.76.519.884.662-.124.142-.391.38-.884.662-.748.427-1.8.832-3.04 1.171C23.264 7.585 19.709 8 16.001 8S8.739 7.586 5.99 6.833c-1.24-.34-2.292-.745-3.04-1.171-.494-.282-.76-.519-.884-.662.124-.142.391-.38.884-.662z"/></svg>
</span>)};

export const Fire = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>fire</title><path d="M10.031 32c-2.133-4.438-.997-6.981.642-9.376 1.795-2.624 2.258-5.221 2.258-5.221s1.411 1.834.847 4.703c2.493-2.775 2.963-7.196 2.587-8.889C22 17.155 24.408 25.681 21.163 32c17.262-9.767 4.294-24.38 2.036-26.027.753 1.646.895 4.433-.625 5.785C20.001 1.999 13.637-.001 13.637-.001c.753 5.033-2.728 10.536-6.084 14.648-.118-2.007-.243-3.392-1.298-5.312-.237 3.646-3.023 6.617-3.777 10.27-1.022 4.946.765 8.568 7.555 12.394z"/></svg>
</span>)};

export const Flag = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>flag</title><path d="M0 0h4v32H0V0zM26 20.094c2.582 0 4.83-.625 6-1.547v-16c-1.17.922-3.418 1.547-6 1.547s-4.83-.625-6-1.547v16c1.17.922 3.418 1.547 6 1.547zM19 1.016C17.534.393 15.39 0 13 0 9.988 0 7.365.625 6 1.547v16C7.365 16.625 9.988 16 13 16c2.39 0 4.534.393 6 1.016v-16z"/></svg>
</span>)};

export const Github = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>github</title><path d="M16 .395c-8.836 0-16 7.163-16 16 0 7.069 4.585 13.067 10.942 15.182.8.148 1.094-.347 1.094-.77 0-.381-.015-1.642-.022-2.979-4.452.968-5.391-1.888-5.391-1.888-.728-1.849-1.776-2.341-1.776-2.341-1.452-.993.11-.973.11-.973 1.606.113 2.452 1.649 2.452 1.649 1.427 2.446 3.743 1.739 4.656 1.33.143-1.034.558-1.74 1.016-2.14-3.554-.404-7.29-1.777-7.29-7.907 0-1.747.625-3.174 1.649-4.295-.166-.403-.714-2.03.155-4.234 0 0 1.344-.43 4.401 1.64a15.353 15.353 0 0 1 4.005-.539c1.359.006 2.729.184 4.008.539 3.054-2.07 4.395-1.64 4.395-1.64.871 2.204.323 3.831.157 4.234 1.026 1.12 1.647 2.548 1.647 4.295 0 6.145-3.743 7.498-7.306 7.895.574.497 1.085 1.47 1.085 2.963 0 2.141-.019 3.864-.019 4.391 0 .426.288.925 1.099.768C27.421 29.457 32 23.462 32 16.395c0-8.837-7.164-16-16-16z"/></svg>
</span>)};

export const Hammer = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>hammer</title><path d="M31.562 25.905l-9.423-9.423a1.505 1.505 0 0 0-2.121 0l-.707.707-5.75-5.75L23 2H13L8.561 6.439 8.122 6H6.001v2.121l.439.439-6.439 6.439 5 5 6.439-6.439 5.75 5.75-.707.707a1.505 1.505 0 0 0 0 2.121l9.423 9.423a1.505 1.505 0 0 0 2.121 0l3.535-3.535a1.505 1.505 0 0 0 0-2.121z"/></svg>
</span>)};

export const Link = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>link</title><path d="M13.757 19.868a1.62 1.62 0 0 1-1.149-.476c-2.973-2.973-2.973-7.81 0-10.783l6-6C20.048 1.169 21.963.376 24 .376s3.951.793 5.392 2.233c2.973 2.973 2.973 7.81 0 10.783l-2.743 2.743a1.624 1.624 0 1 1-2.298-2.298l2.743-2.743a4.38 4.38 0 0 0 0-6.187c-.826-.826-1.925-1.281-3.094-1.281s-2.267.455-3.094 1.281l-6 6a4.38 4.38 0 0 0 0 6.187 1.624 1.624 0 0 1-1.149 2.774z"/><path d="M8 31.625a7.575 7.575 0 0 1-5.392-2.233c-2.973-2.973-2.973-7.81 0-10.783l2.743-2.743a1.624 1.624 0 1 1 2.298 2.298l-2.743 2.743a4.38 4.38 0 0 0 0 6.187c.826.826 1.925 1.281 3.094 1.281s2.267-.455 3.094-1.281l6-6a4.38 4.38 0 0 0 0-6.187 1.624 1.624 0 1 1 2.298-2.298c2.973 2.973 2.973 7.81 0 10.783l-6 6A7.575 7.575 0 0 1 8 31.625z"/></svg>
</span>)};

export const List = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>list</title><path d="M0 0h8v8H0zm12 2h20v4H12zM0 12h8v8H0zm12 2h20v4H12zM0 24h8v8H0zm12 2h20v4H12z"/></svg>
</span>)};

export const Lock = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>lock</title><path d="M18.5 14H18V8c0-3.308-2.692-6-6-6H8C4.692 2 2 4.692 2 8v6h-.5c-.825 0-1.5.675-1.5 1.5v15c0 .825.675 1.5 1.5 1.5h17c.825 0 1.5-.675 1.5-1.5v-15c0-.825-.675-1.5-1.5-1.5zM6 8c0-1.103.897-2 2-2h4c1.103 0 2 .897 2 2v6H6V8z"/></svg>
</span>)};

export const Menu2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="44" height="32" viewBox="0 0 44 32"><title>menu2</title><path d="M0 6h28v6H0V6zm0 8h28v6H0v-6zm0 8h28v6H0v-6zM31 18l6 6 6-6zM43 16l-6-6-6 6z"/></svg>
</span>)};

export const Meter2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>meter2</title><path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zM9.464 26.067A8.98 8.98 0 0 0 10 23a9.002 9.002 0 0 0-5.913-8.456 11.913 11.913 0 0 1 3.427-7.029C9.781 5.249 12.794 4 15.999 4s6.219 1.248 8.485 3.515a11.914 11.914 0 0 1 3.428 7.029 9.003 9.003 0 0 0-5.377 11.523C20.607 27.325 18.355 28 15.999 28s-4.608-.675-6.536-1.933zm7.778-6.036c.434.109.758.503.758.969v2c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-2c0-.466.324-.86.758-.969L15.5 6h1l.742 14.031z"/></svg>
</span>)};

export const Notification = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>notification</title><path d="M16 3c-3.472 0-6.737 1.352-9.192 3.808S3 12.528 3 16c0 3.472 1.352 6.737 3.808 9.192S12.528 29 16 29c3.472 0 6.737-1.352 9.192-3.808S29 19.472 29 16c0-3.472-1.352-6.737-3.808-9.192S19.472 3 16 3zm0-3c8.837 0 16 7.163 16 16s-7.163 16-16 16S0 24.837 0 16 7.163 0 16 0zm-2 22h4v4h-4zm0-16h4v12h-4z"/></svg>
</span>)};

export const PieChart = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>pie-chart</title><path d="M14 18V4C6.268 4 0 10.268 0 18s6.268 14 14 14 14-6.268 14-14a13.94 13.94 0 0 0-1.476-6.262L14 18zM28.524 7.738C26.225 3.15 21.481 0 16 0v14l12.524-6.262z"/></svg>
</span>)};

export const PriceTag = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>price-tag</title><path d="M30.5 0h-12c-.825 0-1.977.477-2.561 1.061L1.06 15.94a1.505 1.505 0 0 0 0 2.121L13.939 30.94a1.505 1.505 0 0 0 2.121 0l14.879-14.879C31.522 15.478 32 14.325 32 13.5v-12c0-.825-.675-1.5-1.5-1.5zM23 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>
</span>)};

export const PriceTags = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="40" height="32" viewBox="0 0 40 32"><title>price-tags</title><path d="M38.5 0h-12c-.825 0-1.977.477-2.561 1.061L9.06 15.94a1.505 1.505 0 0 0 0 2.121L21.939 30.94a1.505 1.505 0 0 0 2.121 0l14.879-14.879C39.522 15.478 40 14.325 40 13.5v-12c0-.825-.675-1.5-1.5-1.5zM31 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/><path d="M4 17L21 0h-2.5c-.825 0-1.977.477-2.561 1.061L1.06 15.94a1.505 1.505 0 0 0 0 2.121L13.939 30.94a1.505 1.505 0 0 0 2.121 0l.939-.939-13-13z"/></svg>
</span>)};

export const Profile = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>profile</title><path d="M27 0H3C1.35 0 0 1.35 0 3v26c0 1.65 1.35 3 3 3h24c1.65 0 3-1.35 3-3V3c0-1.65-1.35-3-3-3zm-1 28H4V4h22v24zM8 18h14v2H8zm0 4h14v2H8zm2-13a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm5 3h-4c-1.65 0-3 .9-3 2v2h10v-2c0-1.1-1.35-2-3-2z"/></svg>
</span>)};

export const Share2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>share2</title><path d="M27 22a4.985 4.985 0 0 0-3.594 1.526L9.937 16.792a5.035 5.035 0 0 0 0-1.582l13.469-6.734a5 5 0 1 0-1.343-2.683L8.594 12.527A5 5 0 1 0 5 21.001a4.985 4.985 0 0 0 3.594-1.526l13.469 6.734A5 5 0 1 0 27 22z"/></svg>
</span>)};

export const Sigma = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>sigma</title><path d="M29.425 22.96L30.812 20H32l-2 12H0v-2.32l10.361-12.225L0 7.094V0h30.625L32 8h-1.074l-.585-1.215C29.237 4.492 28.407 4 26 4H5.312l11.033 11.033L7.051 26H24c3.625 0 4.583-1.299 5.425-3.04z"/></svg>
</span>)};

export const SortAmountAsc = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>sort-amount-asc</title><path d="M10 24V0H6v24H1l7 7 7-7h-5z"/><path d="M14 18h18v4H14v-4zM14 12h14v4H14v-4zM14 6h10v4H14V6zM14 0h6v4h-6V0z"/></svg>
</span>)};

export const StarEmpty = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>star-empty</title><path d="M32 12.408l-11.056-1.607L16 .783l-4.944 10.018L0 12.408l8 7.798-1.889 11.011L16 26.018l9.889 5.199L24 20.206l8-7.798zM16 23.547l-6.983 3.671 1.334-7.776-5.65-5.507 7.808-1.134 3.492-7.075 3.492 7.075 7.807 1.134-5.65 5.507 1.334 7.776-6.983-3.671z"/></svg>
</span>)};

export const StarFull = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>star-full</title><path d="M32 12.408l-11.056-1.607L16 .783l-4.944 10.018L0 12.408l8 7.798-1.889 11.011L16 26.018l9.889 5.199L24 20.206l8-7.798z"/></svg>
</span>)};

export const StarFull2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>star-full2</title><path d="M32 12.408l-11.056-1.607L16 .783l-4.944 10.018L0 12.408l8 7.798-1.889 11.011L16 26.018l9.889 5.199L24 20.206l8-7.798z"/></svg>
</span>)};

export const StatsBars = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>stats-bars</title><path d="M0 26h32v4H0zm4-8h4v6H4zm6-8h4v14h-4zm6 6h4v8h-4zm6-12h4v20h-4z"/></svg>
</span>)};

export const StatsBars2 = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>stats-bars2</title><path d="M9 12H3c-.55 0-1 .45-1 1v18c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V13c0-.55-.45-1-1-1zm0 18H3v-8h6v8zM19 8h-6c-.55 0-1 .45-1 1v22c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm0 22h-6V20h6v10zM29 4h-6c-.55 0-1 .45-1 1v26c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1zm0 26h-6V18h6v12z"/></svg>
</span>)};

export const StatsDots = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>stats-dots</title><path d="M4 28h28v4H0V0h4zm5-2a3 3 0 1 1 .262-5.988l3.225-5.375a3 3 0 1 1 5.026 0l3.225 5.375a3.238 3.238 0 0 1 .46-.005l5.324-9.316a3 3 0 1 1 2.28 1.302l-5.324 9.316a3 3 0 1 1-4.991.053l-3.225-5.375c-.086.007-.174.012-.262.012s-.176-.005-.262-.012l-3.225 5.375A3 3 0 0 1 9 25.999z"/></svg>
</span>)};

export const Switch = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>switch</title><path d="M20 4.581V8.83a10 10 0 0 1 3.071 2.099C24.96 12.818 26 15.329 26 18s-1.04 5.182-2.929 7.071C21.182 26.96 18.671 28 16 28s-5.182-1.04-7.071-2.929C7.04 23.182 6 20.671 6 18s1.04-5.182 2.929-7.071A9.982 9.982 0 0 1 12 8.83V4.581C6.217 6.302 2 11.658 2 18c0 7.732 6.268 14 14 14s14-6.268 14-14c0-6.342-4.217-11.698-10-13.419zM14 0h4v16h-4z"/></svg>
</span>)};

export const Tree = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>tree</title><path d="M30.5 24H30v-6.5c0-1.93-1.57-3.5-3.5-3.5H18v-4h.5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5h-5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h.5v4H5.5C3.57 14 2 15.57 2 17.5V24h-.5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5H6v-6h8v6h-.5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5H18v-6h8v6h-.5c-.825 0-1.5.675-1.5 1.5v5c0 .825.675 1.5 1.5 1.5h5c.825 0 1.5-.675 1.5-1.5v-5c0-.825-.675-1.5-1.5-1.5zM6 30H2v-4h4v4zm12 0h-4v-4h4v4zM14 8V4h4v4h-4zm16 22h-4v-4h4v4z"/></svg>
</span>)};

export const Unlocked = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>unlocked</title><path d="M24 2c3.308 0 6 2.692 6 6v6h-4V8c0-1.103-.897-2-2-2h-4c-1.103 0-2 .897-2 2v6h.5c.825 0 1.5.675 1.5 1.5v15c0 .825-.675 1.5-1.5 1.5h-17C.675 32 0 31.325 0 30.5v-15c0-.825.675-1.5 1.5-1.5H14V8c0-3.308 2.692-6 6-6h4z"/></svg>
</span>)};

export const UserCheck = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>user-check</title><path d="M30 19l-9 9-3-3-2 2 5 5 11-11z"/><path d="M14 24h10v-3.598c-2.101-1.225-4.885-2.066-8-2.321v-1.649c2.203-1.242 4-4.337 4-7.432 0-4.971 0-9-6-9S8 4.029 8 9c0 3.096 1.797 6.191 4 7.432v1.649c-6.784.555-12 3.888-12 7.918h14v-2z"/></svg>
</span>)};

export const User = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>user</title><path d="M18 22.082v-1.649c2.203-1.241 4-4.337 4-7.432 0-4.971 0-9-6-9s-6 4.029-6 9c0 3.096 1.797 6.191 4 7.432v1.649C7.216 22.637 2 25.97 2 30h28c0-4.03-5.216-7.364-12-7.918z"/></svg>
</span>)};

export const Users = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="36" height="32" viewBox="0 0 36 32"><title>users</title><path d="M24 24.082v-1.649c2.203-1.241 4-4.337 4-7.432 0-4.971 0-9-6-9s-6 4.029-6 9c0 3.096 1.797 6.191 4 7.432v1.649C13.216 24.637 8 27.97 8 32h28c0-4.03-5.216-7.364-12-7.918z"/><path d="M10.225 24.854c1.728-1.13 3.877-1.989 6.243-2.513a11.33 11.33 0 0 1-1.265-1.844c-.95-1.726-1.453-3.627-1.453-5.497 0-2.689 0-5.228.956-7.305.928-2.016 2.598-3.265 4.976-3.734C19.153 1.571 17.746 0 14 0 8 0 8 4.029 8 9c0 3.096 1.797 6.191 4 7.432v1.649c-6.784.555-12 3.888-12 7.918h8.719c.454-.403.956-.787 1.506-1.146z"/></svg>
</span>)};

export const Warning = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>warning</title><path d="M16 2.899l13.409 26.726H2.59L15.999 2.899zM16 0c-.69 0-1.379.465-1.903 1.395L.438 28.617C-.608 30.477.282 32 2.416 32h27.166c2.134 0 3.025-1.522 1.978-3.383L17.901 1.395C17.378.465 16.688 0 15.998 0z"/><path d="M18 26a2 2 0 1 1-3.999.001A2 2 0 0 1 18 26zM16 22a2 2 0 0 1-2-2v-6a2 2 0 1 1 4 0v6a2 2 0 0 1-2 2z"/></svg>
</span>)};

export const Wrench = (props) => {
const classes = (props.classes || []).concat('icon').join(' ');
return (<span class={classes}>
<svg width="32" height="32" viewBox="0 0 32 32"><title>wrench</title><path d="M31.342 25.559L16.95 13.223A9 9 0 0 0 6.387.387l5.2 5.2a2.005 2.005 0 0 1 0 2.828l-3.172 3.172a2.005 2.005 0 0 1-2.828 0l-5.2-5.2A9 9 0 0 0 13.223 16.95l12.336 14.392a1.828 1.828 0 0 0 2.716.104l3.172-3.172c.778-.778.731-2-.104-2.716z"/></svg>
</span>)};
