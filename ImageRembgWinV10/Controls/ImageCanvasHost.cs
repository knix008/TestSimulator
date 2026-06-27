namespace ImageRembgWinV10.Controls;



public sealed class ImageCanvasHost : Panel

{

    public ImageCanvasHost()

    {

        BackColor = Color.FromArgb(45, 45, 48);

    }



    public void AttachCanvas(ImageCanvas canvas)

    {

        canvas.Dock = DockStyle.Fill;

        if (!Controls.Contains(canvas))

        {

            Controls.Add(canvas);

        }

    }

}

