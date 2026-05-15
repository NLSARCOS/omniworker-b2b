# nix/packages.nix — OmniWorker Agent package built with uv2nix
{ inputs, ... }:
{
  perSystem =
    { pkgs, inputs', ... }:
    let
      omniworkerAgent = pkgs.callPackage ./omniworker-agent.nix {
        inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
        npm-lockfile-fix = inputs'.npm-lockfile-fix.packages.default;
        # Only embed clean revs — dirtyRev doesn't represent any upstream
        # commit, so comparing it would always claim "update available".
        rev = inputs.self.rev or null;
      };
    in
    {
      packages = {
        default = omniworkerAgent;
        tui = omniworkerAgent.omniworkerTui;
        web = omniworkerAgent.omniworkerWeb;

        fix-lockfiles = omniworkerAgent.omniworkerNpmLib.mkFixLockfiles {
          packages = [ omniworkerAgent.omniworkerTui omniworkerAgent.omniworkerWeb ];
        };
      };
    };
}
