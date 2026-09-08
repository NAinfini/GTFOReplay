# Upstream animation exporter retention

The Recorder/Viewer pull request preserves the original `GTFO Anim Exporter/`
Unity project. Its complete tracked directory is unchanged from the upstream
baseline commit `9db78b8a6`, including its scripts, assets, metadata, packages and
project settings. The exporter is not required for normal Recorder or Viewer
builds.

The fork's additional model extraction, processing and preview website work lives
in [Infini GTFO Model Site](https://github.com/NAinfini/Infini-GTFO-Model-Site).
That separate workflow does not authorize removing the upstream exporter or
replacing it with the model site's modified copy. The optional runtime model
upgrade is reviewed separately from the Recorder/Viewer changes.

Whether to retain this Unity project here, move it to another repository, or
remove it is the upstream maintainer's decision. Any migration or removal should
be proposed separately, with an agreed destination, instructions and dependency
review. Neither the Recorder/Viewer PR nor the optional model PR makes that
decision.

To verify retention against the baseline:

```sh
git diff --exit-code 9db78b8a6 HEAD -- "GTFO Anim Exporter"
```

An empty diff confirms that the original project's tracked contents are retained.
This is a source-preservation check, not a claim that Unity export was run or
validated with a new Unity version.
