namespace MyGitWinV10.App.Dialogs;

internal static class DialogIcons
{
    public static void ApplySuccess(PictureBox pictureBox)
    {
        pictureBox.Image = SystemIcons.Information.ToBitmap();
        pictureBox.SizeMode = PictureBoxSizeMode.CenterImage;
    }

    public static void ApplyError(PictureBox pictureBox)
    {
        pictureBox.Image = SystemIcons.Error.ToBitmap();
        pictureBox.SizeMode = PictureBoxSizeMode.CenterImage;
    }
}
