using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNet.Mvc;
using OmniSharp.Models;

namespace OmniSharp.TypeScriptGeneration
{
    public static class OmnisharpEventExtractor
    {
        public static string GetInterface()
        {
            var methods = "        " + string.Join("\n        ", GetEvents()) + "\n";

            return $"declare module {nameof(OmniSharp)} {{\n    interface Events {{\n{methods}    }}\n}}";
        }

        private static string GetEventReturnType(string propertyName) {
            switch (propertyName) {
                case nameof(EventTypes.ProjectAdded):
                case nameof(EventTypes.ProjectChanged):
                case nameof(EventTypes.ProjectRemoved):
                    return typeof(ProjectInformationResponse).FullName;
                case nameof(EventTypes.Error):
                    return typeof(ErrorMessage).FullName;
                case nameof(EventTypes.MsBuildProjectDiagnostics):
                    return typeof(MSBuildProjectDiagnostics).FullName;
                case nameof(EventTypes.PackageRestoreStarted):
                case nameof(EventTypes.PackageRestoreFinished):
                    return typeof(PackageRestoreMessage).FullName;
                case nameof(EventTypes.UnresolvedDependencies):
                    return typeof(UnresolvedDependenciesMessage).FullName;
                default:
                    return "any";
            }
        }

        private static IEnumerable<string> GetEvents()
        {
            var properties = typeof(EventTypes).GetFields(BindingFlags.Static | BindingFlags.Public);

            foreach (var property in properties)
            {
                var eventName = property.Name.ToLowerInvariant()[0] + property.Name.Substring(1);
                yield return $"{eventName}: Rx.Observable<{GetEventReturnType(property.Name)}>;";
            }
        }
    }
}