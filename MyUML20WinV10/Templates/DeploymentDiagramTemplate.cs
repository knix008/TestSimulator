using MyUML20WinV10.Models;

namespace MyUML20WinV10.Templates;

public static class DeploymentDiagramTemplate
{
    public const string Id = "deployment-diagram";

    public static UmlDiagram Build(UmlProject project)
    {
        var diagram = new UmlDiagram { Name = "Deployment Diagram", Kind = UmlDiagramKind.DeploymentDiagram };

        var appServer = new UmlDeploymentHost { Name = "App Server" };
        var dbServer = new UmlDeploymentHost { Name = "DB Server" };
        var webApp = new UmlArtifact { Name = "shop.war" };
        var database = new UmlArtifact { Name = "shopdb.jar" };
        project.RootPackage.AddDeploymentHost(appServer);
        project.RootPackage.AddDeploymentHost(dbServer);
        project.RootPackage.AddArtifact(webApp);
        project.RootPackage.AddArtifact(database);

        var deployWeb = new UmlDeploymentLink
        {
            SourceClassifierId = webApp.Id,
            TargetClassifierId = appServer.Id,
        };
        var deployDb = new UmlDeploymentLink
        {
            SourceClassifierId = database.Id,
            TargetClassifierId = dbServer.Id,
        };
        var path = new UmlDeploymentPath
        {
            SourceClassifierId = appServer.Id,
            TargetClassifierId = dbServer.Id,
            Name = "JDBC",
        };
        project.RootPackage.AddRelationship(deployWeb);
        project.RootPackage.AddRelationship(deployDb);
        project.RootPackage.AddRelationship(path);

        var appNode = UmlTemplateBuilder.AddNode(diagram, appServer.Id, UmlNodePresentation.DeploymentHost, 80, 120, 160, 90);
        var dbNode = UmlTemplateBuilder.AddNode(diagram, dbServer.Id, UmlNodePresentation.DeploymentHost, 320, 120, 160, 90);
        var webNode = UmlTemplateBuilder.AddNode(diagram, webApp.Id, UmlNodePresentation.Artifact, 100, 260, 120, 72);
        var dbArtNode = UmlTemplateBuilder.AddNode(diagram, database.Id, UmlNodePresentation.Artifact, 340, 260, 120, 72);
        UmlTemplateBuilder.AddEdge(diagram, deployWeb.Id, webNode, appNode);
        UmlTemplateBuilder.AddEdge(diagram, deployDb.Id, dbArtNode, dbNode);
        UmlTemplateBuilder.AddEdge(diagram, path.Id, appNode, dbNode);

        return diagram;
    }

    public static UmlProject BuildProject()
    {
        var project = new UmlProject { Name = "Deployment Diagram Template" };
        project.Diagrams.Clear();
        project.Diagrams.Add(Build(project));
        return project;
    }
}
