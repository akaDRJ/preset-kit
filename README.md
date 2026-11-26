# Preset Kit

- **Scripts:** [Convert](https://raw.githubusercontent.com/akaDRJ/preset-kit/master/dist/substore/convert.js) · [Rename](https://raw.githubusercontent.com/akaDRJ/preset-kit/master/dist/substore/rename.js)
- **Configs:** [Config](https://raw.githubusercontent.com/akaDRJ/preset-kit/master/dist/configs/config.yaml) · [Template](https://raw.githubusercontent.com/akaDRJ/preset-kit/master/dist/configs/template.yaml) · [Preset](https://raw.githubusercontent.com/akaDRJ/preset-kit/master/dist/configs/preset.ini)
- **Rulesets:** [YAML](dist/rulesets/yaml/) · [MRS](dist/rulesets/mrs/)

## Maintenance

Edit the [sources](src/), then rebuild and check using the [CI toolchain](.github/workflows/check.yml):

```sh
npm ci
npm run refresh:all
npm run check
```

Icons: [aaANDkk/Qure_Style_SVG](https://github.com/aaANDkk/Qure_Style_SVG), based on Koolson/Qure. See the [third-party notices](https://github.com/aaANDkk/Qure_Style_SVG/blob/dec37a65d73ea1b558706a446c0798397c2b05c0/THIRD_PARTY_NOTICES.md).
